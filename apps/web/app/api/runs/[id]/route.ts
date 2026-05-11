import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { runs } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  notesMd: z.string().max(100_000).optional(),
  configYaml: z.string().max(200_000).optional(),
  wandbUrl: z.string().url().max(2000).nullable().optional(),
  hfUrl: z.string().url().max(2000).nullable().optional(),
  classification: z.enum(['pending', 'useful', 'not_useful', 'archived']).optional(),
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
    .update(runs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(runs.id, id))
    .returning({ id: runs.id, experimentId: runs.experimentId });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await appendDailyLogTrailBestEffort({
    action: `Updated run ${id.slice(0, 8)}`,
    why: 'A user edited run notes, links, or classification through the web API.',
    entityKind: 'run',
    entityId: id,
    detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });

  return NextResponse.json({ ok: true });
}
