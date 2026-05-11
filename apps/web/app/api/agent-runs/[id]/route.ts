import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents, podLifecycle, runArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/access';
import { requireSession } from '@/lib/auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const runRows = await db().select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  const run = runRows[0];
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const events = await db()
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, id))
    .orderBy(agentRunEvents.createdAt);

  const pods = await db()
    .select()
    .from(podLifecycle)
    .where(eq(podLifecycle.agentRunId, id))
    .orderBy(podLifecycle.createdAt);
  const artifacts = await db()
    .select()
    .from(runArtifacts)
    .where(eq(runArtifacts.agentRunId, id))
    .orderBy(runArtifacts.createdAt);

  return NextResponse.json({ run, events, pods, artifacts, canManageRun: isOwner(session) });
}
