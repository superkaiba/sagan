import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { agentRunEvents, agentRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';

const APPROVED_CHANNEL = 'agent_run_approved';

/**
 * The post-approval orchestrator calls this endpoint when implementer +
 * code-reviewer pair have passed and the experiment is ready to launch on
 * RunPod. We flip the parent experiment-kind run back to `approved` so the
 * runner's `handleApprovedRun` path picks it up — but this time the
 * orchestrator is already in flight as a separate apply run, so we route
 * around it by re-using the `agent_run_approved` channel which the
 * dispatcher uses to call `dispatchApprovedExperiment` directly.
 *
 * To avoid the orchestrator-queue side-effect of `handleApprovedRun`, the
 * dispatcher sees the orchestrator run already exists on this scope and
 * skips re-queuing it; pod dispatch happens directly.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await db()
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  const run = rows[0];
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (run.kind !== 'experiment') {
    return NextResponse.json({ error: 'not_experiment_run', kind: run.kind }, { status: 409 });
  }
  if (!run.planMd) {
    return NextResponse.json({ error: 'plan_md_missing' }, { status: 409 });
  }
  await db()
    .update(agentRuns)
    .set({ status: 'approved', updatedAt: new Date() })
    .where(eq(agentRuns.id, id));
  await db().insert(agentRunEvents).values({
    runId: id,
    eventType: 'launch_pod_requested',
    body: 'Post-approval orchestrator signalled readiness; dispatching pod(s).',
  });
  await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${id})`);
  return NextResponse.json({ ok: true });
}
