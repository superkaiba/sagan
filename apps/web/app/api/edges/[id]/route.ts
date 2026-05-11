import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { edges } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const deleted = await db().delete(edges).where(eq(edges.id, id)).returning();
  const edge = deleted[0];
  if (!edge) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await appendDailyLogTrailBestEffort({
    action: `Removed ${edge.type} link`,
    why: 'A user removed a relationship from the research knowledge graph.',
    entityKind: edge.fromKind,
    entityId: edge.fromId,
    detail: `${edge.fromKind}:${edge.fromId} --${edge.type}--> ${edge.toKind}:${edge.toId}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
