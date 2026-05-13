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
  const primaryAccount = accounts.find((account) => account.account === 'team') ?? accounts[0] ?? null;

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
      {primaryAccount ? (
        <Link href="/runpods" className="block border-b border-[--color-border] px-3 py-2 text-xs hover:bg-[--color-hover]">
          <span className="flex items-center justify-between gap-2">
            <span className="text-[--color-muted]">{primaryAccount.label} balance</span>
            <span className="font-mono text-[--color-fg]">
              {primaryAccount.error ? 'unavailable' : formatUsd(primaryAccount.clientBalance)}
            </span>
          </span>
          {!primaryAccount.error && primaryAccount.currentSpendPerHr != null && primaryAccount.currentSpendPerHr > 0 ? (
            <span className="mt-1 flex items-center justify-between gap-2 text-[--color-muted]">
              <span>{formatUsdPerHour(primaryAccount.currentSpendPerHr)}</span>
              <span>{formatRunway(primaryAccount.clientBalance, primaryAccount.currentSpendPerHr)}</span>
            </span>
          ) : null}
        </Link>
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
            return (
              <li key={pod.id} className="border-b border-[--color-border] last:border-b-0">
                <Link href={pod.href} className="block px-3 py-2 hover:bg-[--color-hover]">
                  <span className="flex min-w-0 items-start gap-2">
                    <Server className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[--color-muted]" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-4 text-[--color-fg]">{podTitle(pod)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 leading-4 text-[--color-muted]">
                        {pod.experimentMarker ? <span className="font-mono text-[11px]">{pod.experimentMarker}</span> : null}
                        <span className="font-mono text-[11px]">{pod.podId.slice(0, 8)}</span>
                        {gpu ? <span>{gpu}</span> : null}
                        <span>{spend == null ? 'spend pending' : `${formatUsd(spend)} spent`}</span>
                        <span>{formatUsdPerHour(rate)}</span>
                        {pod.experimentEstimatedRemainingMinutes == null ? null : (
                          <span>
                            {formatDuration(pod.experimentEstimatedRemainingMinutes * 60)} left
                            {remainingCost == null ? '' : ` · ${formatUsd(remainingCost)}`}
                          </span>
                        )}
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
