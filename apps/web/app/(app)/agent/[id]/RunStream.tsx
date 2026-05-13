'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/Markdown';
import {
  effectiveRunPodRate,
  estimateRunPodSpendUsd,
  estimateRunPodUptimeSeconds,
  formatDuration,
  formatRunway,
  formatUsd,
  formatUsdPerHour,
} from '@/lib/runpod-cost';
import type { RunPodAccountSummary } from '@/lib/runpod-api';

interface RunEvent {
  id: string;
  eventType: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface StructuredPlan {
  goal?: string;
  hypothesis?: string;
  prediction?: string;
  killCriterion?: string;
  compute?: string;
  hardware?: string;
  artifacts?: string;
  verification?: string;
  risks?: string;
  likelyCleanResult?: string;
  sections?: Array<{ title: string; body: string }>;
}

interface RunPodLifecycle {
  id: string;
  podId: string;
  account: string;
  name: string | null;
  gpuTypeId: string | null;
  gpuCount: number | null;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
  status: string;
  desiredStatus: string | null;
  sshHost: string | null;
  sshPort: number | null;
  lastStartedAt: string | null;
  retryCount: number;
  maxRetries: number;
  blockedReason: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  stoppedAt: string | null;
  terminatedAt: string | null;
  createdAt: string;
}

interface RunArtifact {
  id: string;
  kind: string;
  uri: string;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

interface Props {
  runId: string;
  kind: string;
  request: string;
  initialStatus: string;
  initialPlanMd: string | null;
  initialPlanJson: unknown;
  initialEvents: RunEvent[];
  initialPods: RunPodLifecycle[];
  runpodAccounts: RunPodAccountSummary[];
  initialArtifacts: RunArtifact[];
  canManageRun: boolean;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected', 'blocked']);
const METERING_POD_STATUSES = new Set(['deploying', 'running', 'retrying', 'stop_requested']);
const ACTIVE_STALE_AFTER_MS = 10 * 60 * 1000;
type EventFilter = 'all' | 'agent' | 'tools' | 'logs' | 'runpod' | 'artifacts' | 'errors';
const EVENT_FILTERS: Array<{ key: EventFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'agent', label: 'Agent' },
  { key: 'tools', label: 'Tools' },
  { key: 'logs', label: 'Logs' },
  { key: 'runpod', label: 'RunPod' },
  { key: 'artifacts', label: 'Artifacts' },
  { key: 'errors', label: 'Errors' },
];

function formatAge(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function continuationSource(request: string) {
  return request.match(/\[auto-(?:continuation|recovery)-for:([^\]]+)\]/)?.[1] ?? null;
}

function isErrorEvent(ev: RunEvent) {
  const type = ev.eventType.toLowerCase();
  return (
    type === 'failed' ||
    type.endsWith('_failed') ||
    type.endsWith('_blocked') ||
    type.includes('error') ||
    ev.metadata?.is_error === true ||
    ev.metadata?.level === 'error'
  );
}

function primaryEventGroup(ev: RunEvent): Exclude<EventFilter, 'all' | 'errors'> {
  const type = ev.eventType.toLowerCase();
  if (type === 'log') return 'logs';
  if (type.startsWith('runpod_') || type.startsWith('deploy_')) return 'runpod';
  if (type.includes('artifact') || type.includes('upload')) return 'artifacts';
  if (type === 'tool_call' || type === 'tool_result' || type === 'file_change') return 'tools';
  return 'agent';
}

function eventMatchesFilter(ev: RunEvent, filter: EventFilter) {
  if (filter === 'all') return true;
  if (filter === 'errors') return isErrorEvent(ev);
  return primaryEventGroup(ev) === filter;
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return JSON.stringify(value).slice(0, 180);
  }
  return String(value).slice(0, 180);
}

function eventSummary(ev: RunEvent) {
  const metadata = ev.metadata;
  if (!metadata) return null;
  const keys = ['tool', 'tool_name', 'command', 'exit_code', 'status', 'phase', 'podId', 'pod_id', 'stream', 'level'];
  const parts = keys
    .map((key) => {
      const value = formatMetadataValue(metadata[key]);
      return value ? `${key}=${value}` : null;
    })
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function RunStream({
  runId,
  kind,
  request,
  initialStatus,
  initialPlanMd,
  initialPlanJson,
  initialEvents,
  initialPods,
  runpodAccounts,
  initialArtifacts,
  canManageRun,
}: Props) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const [pods, setPods] = useState<RunPodLifecycle[]>(initialPods);
  const [artifacts] = useState<RunArtifact[]>(initialArtifacts);
  const [status, setStatus] = useState(initialStatus);
  const [planMd, setPlanMd] = useState<string | null>(initialPlanMd);
  const [planJson, setPlanJson] = useState<StructuredPlan | null>(() => coerceStructuredPlan(initialPlanJson));
  const [error, setError] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const [copiedReview, setCopiedReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const router = useRouter();
  const seen = useRef(new Set<string>(initialEvents.map((e) => e.id)));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const es = new EventSource(`/api/agent-runs/${runId}/events`);

    es.addEventListener('event', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as RunEvent & { createdAt: string };
      if (seen.current.has(data.id)) return;
      seen.current.add(data.id);
      setEvents((prev) => [...prev, data]);
    });
    es.addEventListener('status', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        status: string;
        planMd: string | null;
        planJson?: unknown;
        lastError: string | null;
      };
      setStatus(data.status);
      if (data.planMd) setPlanMd(data.planMd);
      if (data.planJson) setPlanJson(coerceStructuredPlan(data.planJson));
      if (data.lastError) setError(data.lastError);
    });
    es.addEventListener('done', () => {
      es.close();
      router.refresh();
    });
    es.addEventListener('error', () => {
      es.close();
    });

    return () => es.close();
  }, [runId, status, router]);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/${decision}`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `${decision}_failed`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function stopRunPod() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/runpod/stop`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'runpod_stop_failed');
        return;
      }
      setPods((prev) => prev.map((pod) => ({ ...pod, status: 'stop_requested' })));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/retry`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; runId?: string; message?: string };
      if (!res.ok || !data.runId) {
        setError(data.error ?? 'retry_failed');
        return;
      }
      router.push(`/agent/${data.runId}`);
    } finally {
      setBusy(false);
    }
  }

  async function prepareCodexReview() {
    setBusy(true);
    setError(null);
    setCopiedReview(false);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/codex-review`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!res.ok || !data.prompt) {
        setError(data.error ?? 'codex_review_failed');
        return;
      }
      setReviewPrompt(data.prompt);
    } finally {
      setBusy(false);
    }
  }

  async function copyReviewPrompt() {
    if (!reviewPrompt || !navigator.clipboard) return;
    await navigator.clipboard.writeText(reviewPrompt);
    setCopiedReview(true);
    window.setTimeout(() => setCopiedReview(false), 1500);
  }

  const showApproval = canManageRun && status === 'awaiting_approval' && (kind === 'plan' || kind === 'experiment');
  const canRetry = canManageRun && ['failed', 'blocked', 'cancelled', 'rejected'].includes(status);
  const latestEvent = events.at(-1);
  const latestEventAt = latestEvent ? new Date(latestEvent.createdAt).getTime() : null;
  const active = !TERMINAL.has(status);
  const stale =
    active &&
    latestEventAt !== null &&
    now - latestEventAt > ACTIVE_STALE_AFTER_MS &&
    ['running', 'deploying', 'approved', 'queued'].includes(status);
  const staleHint = stale
    ? `No run events for ${formatAge(now - latestEventAt)}. Refresh this page and check the runner if it does not move.`
    : null;
  const sourceRunId = continuationSource(request);
  const continuationEvents = events.filter((ev) => ev.eventType === 'auto_continuation_queued');
  const recoveryEvents = events.filter((ev) => ev.eventType === 'auto_recovery_queued');
  const manualResumeEvents = events.filter((ev) => ev.eventType === 'manual_resume_queued');
  const latestContinuationId = continuationEvents.at(-1)?.body?.trim() ?? null;
  const latestRecoveryId = recoveryEvents.at(-1)?.body?.trim() ?? null;
  const latestManualResumeId = manualResumeEvents.at(-1)?.body?.trim() ?? null;
  const planApprovalNote =
    showApproval && kind === 'plan'
      ? 'Approving accepts the plan. Execution may continue as a separate apply or continuation run depending on the workflow.'
      : null;
  const hasActivePods = pods.some((pod) => ['deploying', 'running', 'retrying'].includes(pod.status));
  const activePodSpend = pods
    .filter((pod) => METERING_POD_STATUSES.has(pod.status))
    .map((pod) => estimateRunPodSpendUsd(pod))
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);
  const activePodRate = pods
    .filter((pod) => METERING_POD_STATUSES.has(pod.status))
    .map((pod) => effectiveRunPodRate(pod))
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);
  const runpodAccountByKey = new Map(runpodAccounts.map((account) => [account.account, account]));
  const primaryRunpodAccount = pods[0] ? runpodAccountByKey.get(pods[0].account as 'team' | 'personal') : null;
  const filteredEvents = events.filter((ev) => eventMatchesFilter(ev, eventFilter));
  const eventFilterCounts = EVENT_FILTERS.map((filter) => ({
    ...filter,
    count: events.filter((ev) => eventMatchesFilter(ev, filter.key)).length,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] px-4 py-3">
        <span className="text-xs font-medium text-[--color-muted]">Status</span>
        <span className="font-mono text-sm">{status}</span>
        <span className="text-xs text-[--color-muted]">
          {events.length} event{events.length === 1 ? '' : 's'}
          {latestEventAt !== null ? ` · latest ${formatAge(now - latestEventAt)}` : ''}
          {primaryRunpodAccount && activePodRate > 0 ? ` · ${formatRunway(primaryRunpodAccount.clientBalance, activePodRate)}` : ''}
        </span>
        <button
          type="button"
          onClick={() => router.refresh()}
          className="ml-auto rounded-md border border-[--color-border] px-2 py-1 text-xs hover:border-[--color-fg]"
        >
          Refresh
        </button>
        {canRetry ? (
          <button
            type="button"
            disabled={busy}
            onClick={retry}
            className="rounded-md border border-[--color-danger-border] bg-[--color-danger-bg] px-2 py-1 text-xs font-medium text-[--color-danger] hover:border-[--color-danger] disabled:opacity-50"
            title="Spawn a new Claude Code session that picks up where this one stopped"
          >
            Resume
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={prepareCodexReview}
          className="rounded-md border border-[--color-border] px-2 py-1 text-xs hover:border-[--color-fg] disabled:opacity-50"
        >
          Prepare Codex prompt
        </button>
      </div>

      {staleHint ? (
        <p className="rounded-lg border border-[--color-border] bg-[--color-panel] p-3 text-sm text-[--color-muted]">
          {staleHint}
        </p>
      ) : null}

      {sourceRunId || latestContinuationId || latestRecoveryId || latestManualResumeId ? (
        <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4 text-sm">
          <h2 className="font-medium">Resume history</h2>
          <div className="mt-2 space-y-1 text-[--color-muted]">
            {sourceRunId ? (
              <p>
                This run resumes{' '}
                <a className="text-[--color-accent] hover:underline" href={`/agent/${sourceRunId}`}>
                  {sourceRunId.slice(0, 8)}
                </a>
                .
              </p>
            ) : null}
            {latestContinuationId ? (
              <p>
                A continuation was queued as{' '}
                <a className="text-[--color-accent] hover:underline" href={`/agent/${latestContinuationId}`}>
                  {latestContinuationId.slice(0, 8)}
                </a>
                .
              </p>
            ) : null}
            {latestRecoveryId ? (
              <p>
                An automatic recovery run was queued as{' '}
                <a className="text-[--color-accent] hover:underline" href={`/agent/${latestRecoveryId}`}>
                  {latestRecoveryId.slice(0, 8)}
                </a>
                .
              </p>
            ) : null}
            {latestManualResumeId ? (
              <p>
                A manual resume was queued as{' '}
                <a className="text-[--color-accent] hover:underline" href={`/agent/${latestManualResumeId}`}>
                  {latestManualResumeId.slice(0, 8)}
                </a>
                .
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-[--color-danger] bg-[--color-danger-bg] p-4 text-sm text-[--color-danger]">
          {error}
        </pre>
      ) : null}

      {pods.length > 0 || artifacts.length > 0 ? (
        <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">RunPod lifecycle</h2>
              <p className="mt-1 text-xs text-[--color-muted]">
                Stop requests preserve the attached RunPod volume.
                {activePodSpend > 0 ? ` Estimated active spend: ${formatUsd(activePodSpend)}.` : ''}
                {primaryRunpodAccount && activePodRate > 0
                  ? ` Estimated runway for this run: ${formatRunway(primaryRunpodAccount.clientBalance, activePodRate)}.`
                  : ''}
              </p>
            </div>
            <a
              href="/runpods"
              className="rounded-md border border-[--color-border] px-2 py-1 text-xs hover:border-[--color-fg]"
            >
              RunPods
            </a>
            {canManageRun && hasActivePods ? (
              <button
                type="button"
                disabled={busy}
                onClick={stopRunPod}
                className="rounded-md border border-[--color-border] px-2 py-1 text-xs hover:border-[--color-fg] disabled:opacity-50"
              >
                Stop pods
              </button>
            ) : null}
          </div>
          {pods.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {pods.map((pod) => (
                <div key={pod.id} className="rounded-md border border-[--color-border] bg-[--color-bg] p-3 text-sm">
                  {(() => {
                    const rate = effectiveRunPodRate(pod);
                    const uptimeSeconds = estimateRunPodUptimeSeconds(pod);
                    const spend = estimateRunPodSpendUsd(pod);
                    const account = runpodAccountByKey.get(pod.account as 'team' | 'personal');
                    return (
                      <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs">{pod.podId}</span>
                    <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{pod.status}</span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[--color-muted]">
                    <dt>GPU</dt>
                    <dd className="text-[--color-fg]">{pod.gpuCount ?? '-'} x {pod.gpuTypeId ?? '-'}</dd>
                    <dt>Rate</dt>
                    <dd className="text-[--color-fg]">{formatUsdPerHour(rate)}</dd>
                    <dt>Spent</dt>
                    <dd className="text-[--color-fg]">{formatUsd(spend)}</dd>
                    <dt>Runway</dt>
                    <dd className="text-[--color-fg]">{formatRunway(account?.clientBalance ?? null, rate)}</dd>
                    <dt>Uptime</dt>
                    <dd className="text-[--color-fg]">{formatDuration(uptimeSeconds)}</dd>
                    <dt>Desired</dt>
                    <dd className="text-[--color-fg]">{pod.desiredStatus ?? '-'}</dd>
                    <dt>SSH</dt>
                    <dd className="text-[--color-fg]">
                      {pod.sshHost && pod.sshPort ? `${pod.sshHost}:${pod.sshPort}` : '-'}
                    </dd>
                    <dt>Retries</dt>
                    <dd className="text-[--color-fg]">{pod.retryCount}/{pod.maxRetries}</dd>
                  </dl>
                  {pod.lastError || pod.blockedReason ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-[--color-danger]">
                      {pod.blockedReason ?? pod.lastError}
                    </p>
                  ) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          ) : null}
          {artifacts.length > 0 ? (
            <div className="mt-3 rounded-md border border-[--color-border] divide-y divide-[--color-border] text-xs">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="flex flex-wrap items-center gap-2 p-2">
                  <span className="font-medium">{artifact.kind}</span>
                  <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5">{artifact.status}</span>
                  <span className="font-mono text-[--color-muted]">{artifact.uri}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {planMd ? (
        <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[--color-muted]">
            Plan
          </h2>
          {planJson?.sections && planJson.sections.length > 0 ? (
            <div className="mb-4 grid gap-2 md:grid-cols-2">
              {planJson.sections.map((section) => (
                <div key={section.title} className="rounded-md border border-[--color-border] bg-[--color-bg] p-3">
                  <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">{section.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{section.body}</p>
                </div>
              ))}
            </div>
          ) : null}
          <Markdown>{planMd}</Markdown>
          {showApproval ? (
            <div className="mt-4 space-y-3">
              {planApprovalNote ? <p className="text-sm text-[--color-muted]">{planApprovalNote}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide('approve')}
                  className="rounded-md bg-[--color-accent] px-4 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
                >
                  {busy ? 'Working...' : 'Approve'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => decide('reject')}
                  className="rounded-md border border-[--color-border] px-4 py-2 text-sm font-medium hover:border-[--color-fg] disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {reviewPrompt ? (
        <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium">Codex review prompt</h2>
              <p className="mt-1 text-xs text-[--color-muted]">
                This prepares text for Codex. It does not execute a second review agent in this app.
              </p>
            </div>
            <button
              type="button"
              onClick={copyReviewPrompt}
              className="rounded-md border border-[--color-border] px-2 py-1 text-xs hover:border-[--color-fg]"
            >
              {copiedReview ? 'Copied' : 'Copy'}
            </button>
          </div>
          <textarea
            readOnly
            value={reviewPrompt}
            rows={10}
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 font-mono text-xs focus:outline-none"
          />
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-[--color-muted]">Events</h2>
          <div className="flex flex-wrap gap-1">
            {eventFilterCounts.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setEventFilter(filter.key)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  eventFilter === filter.key
                    ? 'border-[--color-accent] bg-[--color-accent] text-[--color-accent-fg]'
                    : 'border-[--color-border] text-[--color-muted] hover:border-[--color-fg] hover:text-[--color-fg]'
                }`}
              >
                {filter.label} {filter.count}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[--color-border] divide-y divide-[--color-border] font-mono text-xs">
          {events.length === 0 ? (
            <p className="p-3 text-[--color-muted]">No events yet.</p>
          ) : filteredEvents.length === 0 ? (
            <p className="p-3 text-[--color-muted]">No matching events.</p>
          ) : (
            filteredEvents.map((ev) => (
              <div key={ev.id} className={`p-3 ${isErrorEvent(ev) ? 'bg-[--color-danger-bg]' : ''}`}>
                <div className="flex items-baseline gap-3 text-[--color-muted]">
                  <span>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                  <span className="text-[--color-fg]">{ev.eventType}</span>
                  <span>{primaryEventGroup(ev)}</span>
                </div>
                {eventSummary(ev) ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-[--color-muted]">{eventSummary(ev)}</p>
                ) : null}
                {ev.body ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-[--color-fg]">{ev.body}</pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function coerceStructuredPlan(value: unknown): StructuredPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as StructuredPlan;
  if (!Array.isArray(plan.sections)) return plan;
  return {
    ...plan,
    sections: plan.sections.filter(
      (section): section is { title: string; body: string } =>
        Boolean(section) && typeof section.title === 'string' && typeof section.body === 'string',
    ),
  };
}
