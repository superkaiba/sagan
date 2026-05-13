import Link from 'next/link';
import { AlertTriangle, ExternalLink, Server } from 'lucide-react';
import { loadActiveRunPods } from '@/lib/dashboard';
import { loadRunPodAccountSummaries, type RunPodAccountSummary } from '@/lib/runpod-api';
import {
  effectiveRunPodRate,
  estimateRunPodRemainingCostUsd,
  estimateRunPodSpendUsd,
  estimateRunPodUptimeSeconds,
  formatDuration,
  formatRunway,
  formatUsd,
  formatUsdPerHour,
} from '@/lib/runpod-cost';
import { formatRelativeTime } from '@/lib/status';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

function accountTone(account: RunPodAccountSummary) {
  if (account.error || account.underBalance) return 'border-[--color-danger-border] bg-[--color-danger-bg]';
  if (account.clientBalance != null && account.minBalance != null && account.clientBalance <= account.minBalance) {
    return 'border-[--color-warning-border] bg-[--color-warning-bg]';
  }
  return 'border-[--color-border] bg-[--color-panel]';
}

function podStatusClass(status: string) {
  if (status === 'running') return 'border-[--color-running-border] bg-[--color-running-bg] text-[--color-running]';
  if (status === 'blocked') return 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]';
  if (status === 'retrying' || status === 'stop_requested') return 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]';
  return 'border-[--color-info-border] bg-[--color-info-bg] text-[--color-info]';
}

export default async function RunPodsPage() {
  const [pods, accounts] = await Promise.all([loadActiveRunPods(100), loadRunPodAccountSummaries()]);
  const accountByKey = new Map(accounts.map((account) => [account.account, account]));
  const activeRate = pods
    .map((pod) => effectiveRunPodRate(pod))
    .filter((rate): rate is number => rate != null)
    .reduce((sum, rate) => sum + rate, 0);
  const activeSpend = pods
    .map((pod) => estimateRunPodSpendUsd(pod))
    .filter((spend): spend is number => spend != null)
    .reduce((sum, spend) => sum + spend, 0);
  const estimatedRemaining = pods
    .map((pod) => estimateRunPodRemainingCostUsd(effectiveRunPodRate(pod), pod.experimentEstimatedRemainingMinutes))
    .filter((spend): spend is number => spend != null)
    .reduce((sum, spend) => sum + spend, 0);
  const hasEstimatedRemaining = pods.some((pod) => pod.experimentEstimatedRemainingMinutes != null);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">RunPods</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            {pods.length} active pod{pods.length === 1 ? '' : 's'} · {formatUsdPerHour(activeRate)} active rate · {formatUsd(activeSpend)} tracked spend
            {hasEstimatedRemaining ? ` · ${formatUsd(estimatedRemaining)} est remaining` : ''}
          </p>
        </div>
        <a
          href="https://console.runpod.io/billing"
          className="inline-flex items-center gap-1.5 rounded-[--radius-control] border border-[--color-border] px-3 py-1.5 text-sm hover:border-[--color-fg]"
        >
          Billing console
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </header>

      {accounts.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.account} className={cn('border p-4 shadow-[var(--shadow-inset)]', accountTone(account))}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{account.label} account</h2>
                  {account.email ? <p className="mt-1 text-xs text-[--color-muted]">{account.email}</p> : null}
                </div>
                {account.error || account.underBalance ? <AlertTriangle className="h-4 w-4 text-[--color-danger]" aria-hidden="true" /> : null}
              </div>
              {account.error ? (
                <p className="mt-3 whitespace-pre-wrap text-sm text-[--color-danger]">{account.error}</p>
              ) : (
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 text-sm">
                  <dt className="text-[--color-muted]">Balance</dt>
                  <dd className="text-right font-mono">{formatUsd(account.clientBalance)}</dd>
                  <dt className="text-[--color-muted]">Spend rate</dt>
                  <dd className="text-right font-mono">{formatUsdPerHour(account.currentSpendPerHr)}</dd>
                  <dt className="text-[--color-muted]">Runway</dt>
                  <dd className="text-right font-mono">{formatRunway(account.clientBalance, account.currentSpendPerHr)}</dd>
                  <dt className="text-[--color-muted]">Spend limit</dt>
                  <dd className="text-right font-mono">{formatUsd(account.spendLimit)}</dd>
                </dl>
              )}
            </div>
          ))}
        </section>
      ) : (
        <section className="border border-[--color-border] bg-[--color-panel] p-4 text-sm text-[--color-muted]">
          No RunPod API keys are configured for the web process.
        </section>
      )}

      <section className="overflow-hidden border border-[--color-border] bg-[--color-panel] shadow-[var(--shadow-inset)]">
        <div className="border-b border-[--color-border] px-4 py-3">
          <h2 className="text-sm font-semibold">Active pods</h2>
        </div>
        {pods.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[--color-muted]">No active RunPods.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-[--color-border] text-xs text-[--color-muted]">
                <tr>
                  <th className="px-4 py-2 font-medium">Pod</th>
                  <th className="px-4 py-2 font-medium">Experiment</th>
                  <th className="px-4 py-2 font-medium">GPU</th>
                  <th className="px-4 py-2 font-medium">Cost</th>
                  <th className="px-4 py-2 font-medium">Estimate</th>
                  <th className="px-4 py-2 font-medium">Runway</th>
                  <th className="px-4 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[--color-border]">
                {pods.map((pod) => {
                  const rate = effectiveRunPodRate(pod);
                  const spend = estimateRunPodSpendUsd(pod);
                  const uptime = estimateRunPodUptimeSeconds(pod);
                  const remainingCost = estimateRunPodRemainingCostUsd(rate, pod.experimentEstimatedRemainingMinutes);
                  const account = accountByKey.get(pod.account as 'team' | 'personal');
                  return (
                    <tr key={pod.id} className="hover:bg-[--color-hover]">
                      <td className="px-4 py-3 align-top">
                        <Link href={pod.href} className="inline-flex items-center gap-2 font-medium hover:text-[--color-accent]">
                          <Server className="h-4 w-4 text-[--color-muted]" aria-hidden="true" />
                          <span className="font-mono">{pod.podId.slice(0, 8)}</span>
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={cn('border px-1.5 py-0.5 font-mono text-[10px]', podStatusClass(pod.status))}>{pod.status}</span>
                          <span className="text-xs text-[--color-muted]">{pod.account}</span>
                        </div>
                      </td>
                      <td className="max-w-md px-4 py-3 align-top">
                        <Link href={pod.href} className="line-clamp-2 hover:text-[--color-accent]">
                          {pod.experimentMarker ? `${pod.experimentMarker} ` : ''}
                          {pod.experimentTitle ?? pod.name ?? 'Unscoped RunPod'}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top text-[--color-muted]">
                        <span className="text-[--color-fg]">{pod.gpuCount ?? '-'}x</span> {pod.gpuTypeId ?? 'GPU'}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono">{formatUsdPerHour(rate)}</div>
                        <div className="mt-1 text-xs text-[--color-muted]">{formatUsd(spend)} · {formatDuration(uptime)}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {pod.experimentEstimatedRemainingMinutes == null ? (
                          <span className="text-xs text-[--color-muted]">No estimate</span>
                        ) : (
                          <>
                            <div className="font-mono">{formatDuration(pod.experimentEstimatedRemainingMinutes * 60)} left</div>
                            <div className="mt-1 text-xs text-[--color-muted]">{formatUsd(remainingCost)} remaining</div>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top font-mono">
                        {formatRunway(account?.clientBalance ?? null, rate)}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-[--color-muted]">{formatRelativeTime(pod.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
