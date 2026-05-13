import Link from 'next/link';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { agentRunEvents, agentRuns, podLifecycle } from '@sagan/db/schema';
import { Markdown } from '@/components/Markdown';
import type { EntityKind } from '@/lib/entity';
import { db } from '@/lib/db';
import { effectiveRunPodRate, estimateRunPodSpendUsd, formatUsd, formatUsdPerHour } from '@/lib/runpod-cost';
import { ResumeAgentButton } from './ResumeAgentButton';

interface AgentActivityPanelProps {
  entityKind: EntityKind;
  entityId: string;
  canManageRun: boolean;
  showWhenEmpty?: boolean;
}

const RESUMABLE_STATUSES = new Set(['failed', 'blocked', 'cancelled', 'rejected']);
const METERING_POD_STATUSES = new Set(['deploying', 'running', 'retrying', 'stop_requested']);

function formatDate(value: Date | string | null) {
  if (!value) return 'not recorded';
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().replace('T', ' ').slice(0, 16);
}

function actionLabel(eventType: string, body: string | null) {
  switch (eventType) {
    case 'started':
      return 'Started the agent session';
    case 'assistant_text':
      return 'Agent wrote an update';
    case 'tool_call':
      return body ? `Called ${body}` : 'Called a tool';
    case 'tool_result':
      return 'Read tool output';
    case 'file_change':
      return body ?? 'Changes made';
    case 'plan_recovered':
      return 'Plan recovered';
    case 'awaiting_approval':
      return 'Plan posted';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Approval rejected';
    case 'deploy_started':
      return 'Started deployment';
    case 'deploy_pod_started':
      return body ? `Started RunPod ${body}` : 'Started a RunPod';
    case 'runpod_status':
      return body ? `RunPod status: ${body}` : 'Checked RunPod status';
    case 'runpod_retry':
      return 'Retried RunPod status check';
    case 'runpod_blocked':
      return 'RunPod blocked';
    case 'auto_continuation_queued':
      return body ? `Restarted automatically as ${body.slice(0, 8)}` : 'Restarted automatically';
    case 'auto_recovery_queued':
      return body ? `Crashed, then restarted as ${body.slice(0, 8)}` : 'Crashed, then restarted';
    case 'auto_continuation_skipped':
      return 'Automatic continuation skipped';
    case 'auto_recovery_skipped':
      return 'Automatic recovery skipped';
    case 'manual_resume_queued':
      return body ? `Resumed manually as ${body.slice(0, 8)}` : 'Resumed manually';
    case 'stale_recovered':
      return 'Detected a stale or crashed run';
    case 'sdk_result':
      return body ? `SDK result: ${body}` : 'SDK result';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Crashed or failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return eventType.replaceAll('_', ' ');
  }
}

function eventBody(eventType: string, body: string | null) {
  if (!body) return null;
  if (eventType === 'tool_call' || eventType === 'file_change') return null;
  return body.length > 360 ? `${body.slice(0, 360)}...` : body;
}

function eventTone(eventType: string) {
  if (['failed', 'runpod_blocked', 'stale_recovered'].includes(eventType)) {
    return 'border-[--color-danger-border] bg-[--color-danger-bg]';
  }
  if (['auto_continuation_queued', 'auto_recovery_queued', 'manual_resume_queued', 'file_change'].includes(eventType)) {
    return 'border-[--color-border] bg-[--color-muted-bg]';
  }
  return 'border-[--color-border] bg-[--color-bg]';
}

function isActivityEvent(eventType: string) {
  return !['assistant_text', 'tool_result', 'sdk_result'].includes(eventType);
}

export async function AgentActivityPanel({
  entityKind,
  entityId,
  canManageRun,
  showWhenEmpty = false,
}: AgentActivityPanelProps) {
  const runs = await db()
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.scopeEntityKind, entityKind), eq(agentRuns.scopeEntityId, entityId)))
    .orderBy(desc(agentRuns.createdAt));

  if (runs.length === 0 && !showWhenEmpty) return null;

  const runIds = runs.map((run) => run.id);
  const events =
    runIds.length > 0
      ? await db()
          .select()
          .from(agentRunEvents)
          .where(inArray(agentRunEvents.runId, runIds))
          .orderBy(asc(agentRunEvents.createdAt))
      : [];
  const pods =
    runIds.length > 0
      ? await db()
          .select()
          .from(podLifecycle)
          .where(inArray(podLifecycle.agentRunId, runIds))
          .orderBy(asc(podLifecycle.createdAt))
      : [];
  const eventsByRun = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByRun.get(event.runId) ?? [];
    list.push(event);
    eventsByRun.set(event.runId, list);
  }
  const podsByRun = new Map<string, typeof pods>();
  for (const pod of pods) {
    if (!pod.agentRunId) continue;
    const list = podsByRun.get(pod.agentRunId) ?? [];
    list.push(pod);
    podsByRun.set(pod.agentRunId, list);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[--color-border] bg-[--color-panel] text-sm">
      <div className="border-b border-[--color-border] px-3 py-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium">Agent log</h2>
          <span className="text-xs text-[--color-muted]">
            {runs.length} run{runs.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      <div className="max-h-[24rem] overflow-y-auto xl:max-h-[42vh]">
        {runs.length === 0 ? (
          <p className="px-4 py-3 text-sm text-[--color-muted]">
            No agent has worked on this issue yet.
          </p>
        ) : (
          <div className="divide-y divide-[--color-border]">
              {runs.map((run) => {
            const runEvents = eventsByRun.get(run.id) ?? [];
            const runPods = podsByRun.get(run.id) ?? [];
            const activePods = runPods.filter((pod) => METERING_POD_STATUSES.has(pod.status));
            const activePodSpends = activePods
              .map((pod) => estimateRunPodSpendUsd(pod))
              .filter((value): value is number => value != null);
            const activeSpendTotal = activePodSpends.reduce((sum, value) => sum + value, 0);
            const activityEvents = runEvents.filter((event) => isActivityEvent(event.eventType));
            const crashed = ['failed', 'blocked'].includes(run.status) && Boolean(run.lastError);
            const resumable = canManageRun && RESUMABLE_STATUSES.has(run.status);
            const open = crashed;

            return (
              <details key={run.id} open={open} className="group">
                <summary className="cursor-pointer list-none px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/agent/${run.id}`} className="font-mono text-xs text-[--color-accent] hover:underline">
                      {run.id.slice(0, 8)}
                    </Link>
                    <span className="text-xs text-[--color-muted]">{run.kind}</span>
                    <span className="rounded-md border border-[--color-border] px-1.5 py-0.5 text-xs">
                      {run.status.replaceAll('_', ' ')}
                    </span>
                    {activePods.length > 0 ? (
                      <span className="rounded-md border border-[--color-running-border] bg-[--color-running-bg] px-1.5 py-0.5 text-xs text-[--color-running]">
                        RunPod spend {activePodSpends.length > 0 ? formatUsd(activeSpendTotal) : 'pending'}
                      </span>
                    ) : null}
                    {crashed ? (
                      <span className="rounded-md border border-[--color-danger-border] bg-[--color-danger-bg] px-1.5 py-0.5 text-xs text-[--color-danger]">
                        crash recorded
                      </span>
                    ) : null}
                    <span className="ml-auto text-xs text-[--color-muted]">
                      {activityEvents.length} activity item{activityEvents.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-[--color-muted]">{run.request}</p>
                </summary>

                <div className="space-y-2 px-3 pb-3">
                  <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-[--color-muted]">Started</dt>
                    <dd>{formatDate(run.startedAt ?? run.createdAt)}</dd>
                    <dt className="text-[--color-muted]">Finished</dt>
                    <dd>{formatDate(run.completedAt)}</dd>
                    {run.lastError ? (
                      <>
                        <dt className="text-[--color-muted]">Failure</dt>
                        <dd className="whitespace-pre-wrap text-[--color-danger]">{run.lastError}</dd>
                      </>
                    ) : null}
                  </dl>

                  {activePods.length > 0 ? (
                    <div className="rounded-md border border-[--color-running-border] bg-[--color-running-bg] p-2 text-xs">
                      <div className="font-medium text-[--color-running]">Active RunPod spend</div>
                      <div className="mt-2 space-y-1">
                        {activePods.map((pod) => {
                          const spend = estimateRunPodSpendUsd(pod);
                          const rate = effectiveRunPodRate(pod);
                          return (
                            <div key={pod.id} className="flex flex-wrap items-center gap-2">
                              <span className="font-mono">{pod.runpodPodId.slice(0, 8)}</span>
                              <span>{pod.status}</span>
                              <span>{pod.gpuCount ?? '-'} x {pod.gpuTypeId ?? 'GPU'}</span>
                              <span>{spend == null ? 'spend pending' : `${formatUsd(spend)} spent`}</span>
                              <span>{formatUsdPerHour(rate)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <details className="rounded-md border border-[--color-border] bg-[--color-bg]">
                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Initial request</summary>
                      <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words border-t border-[--color-border] p-2 text-xs text-[--color-muted]">
                        {run.request}
                      </pre>
                    </details>
                    {run.planMd ? (
                      <details className="rounded-md border border-[--color-border] bg-[--color-bg]">
                        <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Full plan</summary>
                        <div className="max-h-48 overflow-y-auto border-t border-[--color-border] p-2">
                          <Markdown className="text-xs">{run.planMd}</Markdown>
                        </div>
                      </details>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/agent/${run.id}`}
                      className="rounded-md border border-[--color-border] px-2 py-1 text-xs font-medium hover:border-[--color-fg]"
                    >
                      Open run
                    </Link>
                    {resumable ? <ResumeAgentButton runId={run.id} /> : null}
                    {runEvents.length !== activityEvents.length ? (
                      <span className="self-center text-xs text-[--color-muted]">
                        Full raw log: {runEvents.length} events
                      </span>
                    ) : null}
                  </div>

                  <ol className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {activityEvents.length === 0 ? (
                      <li className="text-sm text-[--color-muted]">No high-level activity was recorded before the run stopped.</li>
                    ) : (
                      activityEvents.map((event) => {
                        const body = eventBody(event.eventType, event.body);
                        return (
                          <li key={event.id} className={`rounded-md border px-2 py-1.5 text-xs ${eventTone(event.eventType)}`}>
                            <div className="flex flex-wrap items-baseline gap-2">
                              <time className="font-mono text-[--color-muted]" dateTime={event.createdAt.toISOString()}>
                                {formatDate(event.createdAt)}
                              </time>
                              <span className="font-medium">{actionLabel(event.eventType, event.body)}</span>
                            </div>
                            {body ? <pre className="mt-1 whitespace-pre-wrap break-words text-[--color-muted]">{body}</pre> : null}
                          </li>
                        );
                      })
                    )}
                  </ol>
                </div>
              </details>
            );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
