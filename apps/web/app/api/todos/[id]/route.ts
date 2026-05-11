import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { todos } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  text: z.string().min(1).max(500).optional(),
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
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const updated = await db()
    .update(todos)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(todos.id, id))
    .returning({ id: todos.id, text: todos.text, status: todos.status });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    action: `Updated task ${updated[0].text}`,
    why: parsed.data.status
      ? `Move task workflow state to ${parsed.data.status}.`
      : 'A user edited task metadata.',
    entityKind: 'todo',
    entityId: id,
    detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const updated = await db()
    .update(todos)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(todos.id, id))
    .returning({ id: todos.id, text: todos.text });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    action: `Archived task ${updated[0].text}`,
    why: 'A user removed the task from the active workflow board.',
    entityKind: 'todo',
    entityId: id,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
