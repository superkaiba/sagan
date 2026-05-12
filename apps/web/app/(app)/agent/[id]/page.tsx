import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents, podLifecycle, runArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { isOwner } from '@/lib/access';
import { requireSession } from '@/lib/auth';
import { AwaitingApprovalBanner } from '@/components/AwaitingApprovalBanner';
import { RunStream } from './RunStream';

export const dynamic = 'force-dynamic';

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
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

  return (
    <div className="space-y-6">
      <AwaitingApprovalBanner kind="run" id={run.id} />
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-wide text-[--color-muted]">{run.kind}</span>
          <h1 className="text-2xl font-semibold tracking-tight">Run {run.id.slice(0, 8)}</h1>
        </div>
        <p className="text-sm text-[--color-muted]">{run.request}</p>
      </header>

      <RunStream
        runId={run.id}
        kind={run.kind}
        request={run.request}
        initialStatus={run.status}
        initialPlanMd={run.planMd}
        initialPlanJson={run.planJson}
        initialEvents={events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          body: e.body,
          createdAt: e.createdAt.toISOString(),
        }))}
        initialPods={pods.map((pod) => ({
          id: pod.id,
          podId: pod.runpodPodId,
          account: pod.account,
          name: pod.name,
          gpuTypeId: pod.gpuTypeId,
          gpuCount: pod.gpuCount,
          status: pod.status,
          desiredStatus: pod.desiredStatus,
          sshHost: pod.sshHost,
          sshPort: pod.sshPort,
          retryCount: pod.retryCount,
          maxRetries: pod.maxRetries,
          blockedReason: pod.blockedReason,
          lastError: pod.lastError,
          lastCheckedAt: pod.lastCheckedAt?.toISOString() ?? null,
        }))}
        initialArtifacts={artifacts.map((artifact) => ({
          id: artifact.id,
          kind: artifact.kind,
          uri: artifact.uri,
          status: artifact.status,
          verifiedAt: artifact.verifiedAt?.toISOString() ?? null,
          createdAt: artifact.createdAt.toISOString(),
        }))}
        canManageRun={isOwner(session)}
      />
    </div>
  );
}
