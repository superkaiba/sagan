import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  bodyMd: z.string().min(1).max(20_000).optional(),
  kind: z.enum(['clean_result', 'blocker', 'decision', 'note']).optional(),
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
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const updated = await db()
    .update(dailyLogEntries)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(dailyLogEntries.id, id))
    .returning({
      id: dailyLogEntries.id,
      day: dailyLogEntries.day,
      kind: dailyLogEntries.kind,
      bodyMd: dailyLogEntries.bodyMd,
      entityKind: dailyLogEntries.entityKind,
      entityId: dailyLogEntries.entityId,
    });
  const entry = updated[0];
  if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    day: entry.day,
    action: `Updated ${entry.kind} daily log entry`,
    why: 'A user edited the saved daily-log card.',
    entityKind: entry.entityKind ?? 'daily_log_entry',
    entityId: entry.entityId ?? entry.id,
    detail: entry.bodyMd.slice(0, 500),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true, entry });
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
    .update(dailyLogEntries)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(dailyLogEntries.id, id))
    .returning({
      id: dailyLogEntries.id,
      day: dailyLogEntries.day,
      kind: dailyLogEntries.kind,
      bodyMd: dailyLogEntries.bodyMd,
      entityKind: dailyLogEntries.entityKind,
      entityId: dailyLogEntries.entityId,
    });
  const entry = updated[0];
  if (!entry) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    day: entry.day,
    action: `Archived ${entry.kind} daily log entry`,
    why: 'A user removed the entry from the active daily log while preserving the archived record.',
    entityKind: entry.entityKind ?? undefined,
    entityId: entry.entityId ?? undefined,
    detail: entry.bodyMd.slice(0, 500),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
