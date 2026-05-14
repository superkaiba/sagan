'use client';

import Link from 'next/link';
import { Cloud, ExternalLink, Server } from 'lucide-react';
import type { DashboardRunPod } from '@/lib/dashboard';
import type { RunPodAccountSummary } from '@/lib/runpod-api';
import { cn } from '@/lib/cn';
import {
  estimateRunPodRemainingCostUsd,
  estimateRunPodSpendUsd,
  effectiveRunPodRate,
  formatDuration,
  formatRunway,
  formatUsd,
  formatUsdPerHour,
} from '@/lib/runpod-cost';
import { formatRelativeTime } from '@/lib/status';

function podStatusClass(status: string) {
  if (status === 'running') return 'border-[--color-running-border] bg-[--color-running-bg] text-[--color-running]';
  if (status === 'blocked') return 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]';
  if (status === 'retrying' || status === 'stop_requested') {
    return 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]';
  }
  return 'border-[--color-info-border] bg-[--color-info-bg] text-[--color-info]';
}

function podTitle(pod: DashboardRunPod) {
  return pod.experimentTitle ?? pod.name ?? pod.podId;
}

function podGpu(pod: DashboardRunPod) {
  if (!pod.gpuTypeId && !pod.gpuCount) return null;
  return `${pod.gpuCount ?? '-'}x ${pod.gpuTypeId ?? 'GPU'}`;
}

export function ActiveRunPodsPanel({
  initialPods,
  accounts = [],
}: {
  initialPods: DashboardRunPod[];
  accounts?: RunPodAccountSummary[];
}) {
  const pods = initialPods;
  // Show every account (team + personal) so the left-rail panel always
  // surfaces the full picture instead of just the primary account.
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (a.account === b.account) return 0;
    return a.account === 'team' ? -1 : 1;
  });

  const activeSpend = pods
    .map((pod) => estimateRunPodSpendUsd(pod))
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);

  return (
    <section className="border border-[--color-border] bg-[--color-bg] text-sm shadow-[var(--shadow-inset)]" aria-live="polite">
      <div className="flex items-center justify-between gap-2 border-b border-[--color-border] px-3 py-2">
        <Link href="/runpods" className="inline-flex min-w-0 items-center gap-2 font-semibold hover:text-[--color-accent]">
          <Cloud
            className={cn('h-4 w-4 shrink-0', pods.length > 0 ? 'text-[--color-running]' : 'text-[--color-muted]')}
            aria-hidden="true"
          />
          <span>RunPods</span>
        </Link>
        <span className="inline-flex items-center gap-1.5">
          {activeSpend > 0 ? <span className="font-mono text-xs text-[--color-muted]">{formatUsd(activeSpend)}</span> : null}
          <span
            className={cn(
              'border px-1.5 py-0.5 font-mono text-xs',
              pods.length > 0
                ? 'border-[--color-running-border] bg-[--color-panel] text-[--color-running]'
                : 'border-transparent text-[--color-muted]',
            )}
          >
            {pods.length}
          </span>
        </span>
      </div>
      {sortedAccounts.length > 0 ? (
        <div className="divide-y divide-[--color-border] border-b border-[--color-border]">
          {sortedAccounts.map((account) => (
            <Link
              key={account.account}
              href="/runpods"
              className="block px-3 py-2 text-xs hover:bg-[--color-hover]"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[--color-muted]">{account.label} balance</span>
                <span className="font-mono text-[--color-fg]">
                  {account.error ? 'unavailable' : formatUsd(account.clientBalance)}
                </span>
              </span>
              {!account.error && account.currentSpendPerHr != null && account.currentSpendPerHr > 0 ? (
                <span className="mt-1 flex items-center justify-between gap-2 text-[--color-muted]">
                  <span>{formatUsdPerHour(account.currentSpendPerHr)}</span>
                  <span>{formatRunway(account.clientBalance, account.currentSpendPerHr)}</span>
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
      {pods.length === 0 ? (
        <p className="px-3 py-2 text-xs leading-4 text-[--color-muted]">No active pods</p>
      ) : (
        <ul className="max-h-56 overflow-y-auto text-xs">
          {pods.map((pod) => {
            const gpu = podGpu(pod);
            const spend = estimateRunPodSpendUsd(pod);
            const rate = effectiveRunPodRate(pod);
            const remainingCost = estimateRunPodRemainingCostUsd(rate, pod.experimentEstimatedRemainingMinutes);
            // Total estimated cost = spent-so-far + cost-of-remaining-time. Both
            // pieces are pulled from the same source (pod_lifecycle metadata +
            // experiments.plan_json.saganUi), so when either is missing we
            // suppress the combined number rather than showing a misleading
            // partial total. The pod-bootstrap heartbeat keeps the remaining
            // half fresh even when the experiment script isn't posting its
            // own ETAs; the EPS-side helper improves the estimate once
            // training has accumulated a few step-time samples.
            const totalEstCost = spend != null && remainingCost != null ? spend + remainingCost : null;
            const pctText =
              pod.experimentProgressPct == null
                ? null
                : `${pod.experimentProgressPct.toFixed(pod.experimentProgressPct % 1 === 0 ? 0 : 1)}%`;
            const remainingText =
              pod.experimentEstimatedRemainingMinutes == null
                ? null
                : `${formatDuration(pod.experimentEstimatedRemainingMinutes * 60)} left`;
            // Build the summary line only when at least one signal exists, so
            // the row stays compact for pods that haven't started reporting.
            const summarySegments = [pctText, remainingText, totalEstCost == null ? null : `${formatUsd(totalEstCost)} est`].filter(
              (segment): segment is string => Boolean(segment),
            );
            return (
              <li key={pod.id} className="border-b border-[--color-border] last:border-b-0">
                <Link href={pod.href} className="block px-3 py-2 hover:bg-[--color-hover]">
                  <span className="flex min-w-0 items-start gap-2">
                    <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[--color-muted]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-4 text-[--color-fg]">{podTitle(pod)}</span>
                      {summarySegments.length > 0 ? (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] leading-4 text-[--color-running]">
                          {summarySegments.map((segment, idx) => (
                            <span key={idx}>{segment}</span>
                          ))}
                        </span>
                      ) : null}
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 leading-4 text-[--color-muted]">
                        {pod.experimentMarker ? <span className="font-mono text-[11px]">{pod.experimentMarker}</span> : null}
                        <span className="font-mono text-[11px]">{pod.podId.slice(0, 8)}</span>
                        {gpu ? <span>{gpu}</span> : null}
                        <span>{spend == null ? 'spend pending' : `${formatUsd(spend)} spent`}</span>
                        <span>{formatUsdPerHour(rate)}</span>
                        {pod.experimentEstimatedRemainingMessage ? (
                          <span className="max-w-full truncate">{pod.experimentEstimatedRemainingMessage}</span>
                        ) : null}
                        <span>{formatRelativeTime(pod.updatedAt)}</span>
                      </span>
                    </span>
                    <span className={cn('shrink-0 border px-1.5 py-0.5 font-mono text-[10px]', podStatusClass(pod.status))}>
                      {pod.status}
                    </span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-[--color-muted]" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
