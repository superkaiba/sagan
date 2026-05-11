import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { cleanResults, shareGrants } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
  const cleanResult = rows[0];
  if (!cleanResult) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (cleanResult.status !== 'approved' && cleanResult.status !== 'shared') {
    return NextResponse.json({ error: 'approved_required' }, { status: 409 });
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await db().insert(shareGrants).values({
    entityKind: 'clean_result',
    entityId: id,
    token,
    expiresAt,
  });
  await db()
    .update(cleanResults)
    .set({ status: 'shared', sharedAt: new Date(), updatedAt: new Date() })
    .where(eq(cleanResults.id, id));
  await appendDailyLogTrailBestEffort({
    action: `Shared clean result ${id.slice(0, 8)}`,
    why: 'The owner created an opaque public share token for the approved clean result.',
    entityKind: 'clean_result',
    entityId: id,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });

  return NextResponse.json({ token, url: `/r/${token}`, expiresAt: expiresAt.toISOString() });
}
