import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { kanbanCards } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  columnId: z.string().uuid().optional(),
  title: z.string().min(1).max(500).optional(),
  bodyMd: z.string().max(20_000).optional(),
  position: z.number().int().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
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
  await db().update(kanbanCards).set(updates).where(eq(kanbanCards.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  await db()
    .update(kanbanCards)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(kanbanCards.id, id));
  return NextResponse.json({ ok: true });
}
