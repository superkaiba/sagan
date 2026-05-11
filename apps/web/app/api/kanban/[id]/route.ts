import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { kanbanCards, kanbanColumns, todos } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { todoStatusForColumn } from '@/lib/kanban';

const patchSchema = z.object({
  columnId: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  bodyMd: z.string().max(20_000).optional(),
  position: z.number().int().optional(),
  archived: z.boolean().optional(),
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
  const updates: Partial<typeof kanbanCards.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.columnId !== undefined) updates.columnId = parsed.data.columnId;
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.bodyMd !== undefined) updates.bodyMd = parsed.data.bodyMd;
  if (parsed.data.position !== undefined) updates.position = parsed.data.position;
  if (parsed.data.archived) updates.archivedAt = new Date();
  const updated = await db()
    .update(kanbanCards)
    .set(updates)
    .where(eq(kanbanCards.id, id))
    .returning({
      id: kanbanCards.id,
      title: kanbanCards.title,
      bodyMd: kanbanCards.bodyMd,
      columnId: kanbanCards.columnId,
      linkedKind: kanbanCards.linkedKind,
      linkedId: kanbanCards.linkedId,
    });
  const card = updated[0];
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.linkedKind === 'todo' && card.linkedId) {
    const todoUpdates: Partial<typeof todos.$inferInsert> = { updatedAt: new Date() };
    if (parsed.data.title !== undefined) todoUpdates.text = parsed.data.title;
    if (parsed.data.bodyMd !== undefined) todoUpdates.bodyMd = parsed.data.bodyMd;
    if (parsed.data.columnId !== undefined) {
      const columnRows = await db()
        .select({ title: kanbanColumns.title })
        .from(kanbanColumns)
        .where(eq(kanbanColumns.id, parsed.data.columnId))
        .limit(1);
      const column = columnRows[0];
      if (column) todoUpdates.status = todoStatusForColumn(column);
    }
    if (parsed.data.archived) todoUpdates.status = 'archived';
    await db().update(todos).set(todoUpdates).where(eq(todos.id, card.linkedId));
  }
  await appendDailyLogTrailBestEffort({
    action: `Updated kanban card ${card.title}`,
    why: parsed.data.columnId
      ? 'A user moved the card to another workflow column.'
      : 'A user edited or archived workflow-board card metadata.',
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
    .update(kanbanCards)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(kanbanCards.id, id))
    .returning({
      id: kanbanCards.id,
      title: kanbanCards.title,
      linkedKind: kanbanCards.linkedKind,
      linkedId: kanbanCards.linkedId,
    });
  const card = updated[0];
  if (!card) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (card.linkedKind === 'todo' && card.linkedId) {
    await db().update(todos).set({ status: 'archived', updatedAt: new Date() }).where(eq(todos.id, card.linkedId));
  }
  await appendDailyLogTrailBestEffort({
    action: `Archived kanban card ${card.title}`,
    why: 'A user removed the card from the active workflow board.',
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
