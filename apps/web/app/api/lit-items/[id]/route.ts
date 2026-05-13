import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { litItems } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  readState: z
    .enum(['unread', 'summary_read', 'saved_for_later', 'reading', 'read', 'read_deeply'])
    .optional(),
  queuePosition: z.number().int().optional(),
  title: z.string().min(1).max(500).optional(),
  authors: z.array(z.string().min(1).max(200)).max(100).optional(),
  releasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  url: z.string().url().nullable().optional(),
  pdfUrl: z.string().url().nullable().optional(),
  arxivId: z.string().max(64).nullable().optional(),
  doi: z.string().max(200).nullable().optional(),
  abstract: z.string().max(20_000).optional(),
  summaryMd: z.string().max(20_000).optional(),
  relevanceReasonMd: z.string().max(20_000).optional(),
  threatReasonMd: z.string().max(20_000).optional(),
  topic: z
    .enum(['current_project', 'general_safety', 'general_ai', 'cognitive_science', 'neuroscience', 'other'])
    .optional(),
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
    .update(litItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(litItems.id, id))
    .returning({ id: litItems.id, title: litItems.title });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    action: `Updated literature item ${updated[0].title}`,
    why: parsed.data.readState
      ? `Move the source through the reading workflow to ${parsed.data.readState}.`
      : 'A user edited source metadata.',
    entityKind: 'lit_item',
    entityId: id,
    detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
