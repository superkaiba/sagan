import { NextResponse } from 'next/server';
import { desc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { comments, todos } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const PIPELINE_CHANNEL = 'pipeline_changed';

async function notifyPipelineChanged(payload: string) {
  try {
    await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${payload})`);
  } catch {
    // Best effort; the dashboard SSE endpoint also polls timestamps.
  }
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const rows = await db()
    .select()
    .from(todos)
    .where(ne(todos.status, 'archived'))
    .orderBy(desc(todos.updatedAt))
    .limit(500);
  return NextResponse.json({ todos: rows });
}

const createSchema = z.object({
  text: z.string().min(1).max(500),
  bodyMd: z.string().max(20_000).optional(),
  status: z
    .enum([
      'inbox',
      'scoped',
      'planning',
      'open',
      'in_progress',
      'running',
      'interpreting',
      'awaiting_promotion',
      'blocked',
      'done',
      'cancelled',
      'archived',
    ])
    .default('inbox'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  ownerNote: z.string().max(20_000).optional(),
  linkedKind: z.string().max(40).optional(),
  linkedId: z.string().uuid().optional(),
  // When set, the originating comment is resolved (so the "Move to todo"
  // button on a proposed-follow-up comment doesn't leave the proposal
  // un-promoted-looking after the user accepts it).
  fromCommentId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { fromCommentId, linkedKind, linkedId, ...todoValues } = parsed.data;
  const inserted = await db()
    .insert(todos)
    .values({
      ...todoValues,
      linkedKind: linkedKind as typeof todos.$inferInsert['linkedKind'],
      linkedId,
    })
    .returning();
  const todo = inserted[0]!;
  if (fromCommentId) {
    await db()
      .update(comments)
      .set({
        resolvedAt: new Date(),
        resolvedBy: session.user.id,
        resolvedSummaryMd: `Promoted to todo ${todo.id.slice(0, 8)}: ${todo.text.slice(0, 200)}`,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, fromCommentId));
  }
  await appendDailyLogTrailBestEffort({
    action: `Created task ${todo.text}`,
    why: 'A user added a task to track the next research or engineering action.',
    entityKind: 'todo',
    entityId: todo.id,
    detail: `status=${todo.status}; priority=${todo.priority}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: todo.id,
  });
  await notifyPipelineChanged(`todo:${todo.id}:created`);
  return NextResponse.json({ todo: inserted[0] });
}
