import { NextResponse } from 'next/server';
import { desc, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { todos } from '@sagan/db/schema';
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
  const inserted = await db()
    .insert(todos)
    .values(parsed.data)
    .returning();
  const todo = inserted[0]!;
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
