import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { weeklyDigests } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  bodyMd: z.string().max(200_000).optional(),
  sentAt: z.boolean().optional(),
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
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const updates: Partial<typeof weeklyDigests.$inferInsert> = {};
  if (parsed.data.bodyMd !== undefined) {
    updates.bodyMd = parsed.data.bodyMd;
    updates.editedAt = new Date();
  }
  if (parsed.data.sentAt) updates.sentAt = new Date();
  const updated = await db()
    .update(weeklyDigests)
    .set(updates)
    .where(eq(weeklyDigests.id, id))
    .returning({ id: weeklyDigests.id, weekStart: weeklyDigests.weekStart });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    action: parsed.data.sentAt
      ? `Marked weekly digest ${updated[0].weekStart} sent`
      : `Edited weekly digest ${updated[0].weekStart}`,
    why: parsed.data.sentAt
      ? 'A user marked the advisor/mentor summary as sent.'
      : 'A user revised the advisor/mentor summary before sharing.',
    detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
