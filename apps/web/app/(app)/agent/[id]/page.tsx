import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents, experiments, podLifecycle, runArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/access';
import { getSession } from '@/lib/auth';
import { loadRunPodAccountSummaries } from '@/lib/runpod-api';
import { Comments } from '@/components/Comments';
import { RunStream } from './RunStream';
import { AgentRunRequest } from './AgentRunRequest';

export const dynamic = 'force-dynamic';

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  // Public read (2026-07-06): agent run pages render without a session.
  const session = await getSession();
  const { id } = await params;
  const runs = await db().select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  const run = runs[0];
  if (!run) return notFound();
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
  // Account balance/spend telemetry is owner-only; public viewers get the
  // pod list without the financial summaries.
  const owner = session ? isOwner(session) : false;
  const runpodAccounts = owner && pods.length > 0 ? await loadRunPodAccountSummaries() : [];

  // For experiment-scoped runs, the canonical plan lives on experiments
  // (since 0029). For non-experiment runs (todo plans) it lives on the
  // agent_run row — that's storage divergence by entity, not a fallback.
  let canonicalPlanMd: string | null = run.planMd;
  let canonicalPlanJson: typeof run.planJson = run.planJson;
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    const expRows = await db()
      .select({ planMd: experiments.planMd, planJson: experiments.planJson })
      .from(experiments)
      .where(eq(experiments.id, run.scopeEntityId))
      .limit(1);
    const exp = expRows[0];
    canonicalPlanMd = exp?.planMd ?? null;
    canonicalPlanJson = exp?.planJson ?? null;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-wide text-[--color-muted]">{run.kind}</span>
          <h1 className="text-2xl font-semibold tracking-tight">Run {run.id.slice(0, 8)}</h1>
        </div>
        <AgentRunRequest request={run.request} />
      </header>

      <RunStream
        runId={run.id}
        kind={run.kind}
        request={run.request}
        initialStatus={run.status}
        initialPlanMd={canonicalPlanMd}
        initialPlanJson={canonicalPlanJson}
        initialEvents={events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          body: e.body,
          metadata: e.metadata as Record<string, unknown> | null,
          createdAt: e.createdAt.toISOString(),
        }))}
        initialPods={pods.map((pod) => ({
          id: pod.id,
          podId: pod.runpodPodId,
          account: pod.account,
          name: pod.name,
          gpuTypeId: pod.gpuTypeId,
          gpuCount: pod.gpuCount,
          costPerHr: pod.costPerHr,
          adjustedCostPerHr: pod.adjustedCostPerHr,
          uptimeSeconds: pod.uptimeSeconds,
          status: pod.status,
          desiredStatus: pod.desiredStatus,
          sshHost: pod.sshHost,
          sshPort: pod.sshPort,
          lastStartedAt: pod.lastStartedAt?.toISOString() ?? null,
          retryCount: pod.retryCount,
          maxRetries: pod.maxRetries,
          blockedReason: pod.blockedReason,
          lastError: pod.lastError,
          lastCheckedAt: pod.lastCheckedAt?.toISOString() ?? null,
          stoppedAt: pod.stoppedAt?.toISOString() ?? null,
          terminatedAt: pod.terminatedAt?.toISOString() ?? null,
          createdAt: pod.createdAt.toISOString(),
        }))}
        runpodAccounts={runpodAccounts}
        initialArtifacts={artifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          uri: artifact.uri,
          status: artifact.status,
          verifiedAt: artifact.verifiedAt?.toISOString() ?? null,
          createdAt: artifact.createdAt.toISOString(),
        }))}
        canManageRun={owner}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-muted]">
          Discussion
        </h2>
        <Comments entityKind="agent_run" entityId={run.id} />
      </section>
    </div>
  );
}
