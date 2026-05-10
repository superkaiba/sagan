import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { weeklyDigests } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  bodyMd: z.string().max(200_000).optional(),
  sentAt: z.boolean().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const updates: Partial<typeof weeklyDigests.$inferInsert> = {};
  if (parsed.data.bodyMd !== undefined) {
    updates.bodyMd = parsed.data.bodyMd;
    updates.editedAt = new Date();
  }
  if (parsed.data.sentAt) updates.sentAt = new Date();
  await db().update(weeklyDigests).set(updates).where(eq(weeklyDigests.id, id));
  return NextResponse.json({ ok: true });
}
