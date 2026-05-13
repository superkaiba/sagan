import Link from 'next/link';
import { requireOwner } from '@/lib/access';
import { loadHealthSummary } from '@/lib/health';
import { effectiveRunPodRate, estimateRunPodSpendUsd, formatUsd, formatUsdPerHour } from '@/lib/runpod-cost';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireOwner();
  const health = await loadHealthSummary();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Health</h1>
          <p className="text-sm text-[--color-muted]">Generated {new Date(health.generatedAt).toLocaleString()}</p>
        </div>
        <Link href="/agent" className="rounded-md border border-[--color-border] px-3 py-2 text-sm hover:border-[--color-fg]">
          Agent
        </Link>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <Summary title="Agent runs" rows={health.agentStatusCounts.map((row) => [row.status, row.count])} />
        <Summary title="Notifications" rows={health.notificationCounts.map((row) => [row.emailStatus, row.count])} />
        <Summary
          title="Active state"
          rows={[
            ['experiments', health.activeExperiments.length],
            ['pods', health.activePods.length],
            ['runs', health.activeRuns.length],
          ]}
        />
      </section>

      <Table
        title="Active runs"
        headers={['status', 'kind', 'request', 'updated']}
        rows={health.activeRuns.map((run) => [
          run.status,
          run.kind,
          <Link key={run.id} href={`/agent/${run.id}`} className="hover:underline">{run.request.slice(0, 120)}</Link>,
          run.updatedAt.toISOString().slice(0, 16),
        ])}
      />

      <Table
        title="Recent jobs"
        headers={['status', 'kind', 'error', 'created']}
        rows={health.recentJobs.map((job) => [
          job.status,
          job.kind,
          job.lastError?.slice(0, 120) ?? '',
          job.createdAt.toISOString().slice(0, 16),
        ])}
      />

      <Table
        title="Active experiments"
        headers={['status', 'title', 'updated']}
        rows={health.activeExperiments.map((experiment) => [
          experiment.status,
          <Link key={experiment.id} href={`/e/experiment/${experiment.id}`} className="hover:underline">{experiment.title}</Link>,
          experiment.updatedAt.toISOString().slice(0, 16),
        ])}
      />

      <Table
        title="Active pods"
        headers={['status', 'pod', 'run', 'spent', 'rate', 'error']}
        rows={health.activePods.map((pod) => {
          const spend = estimateRunPodSpendUsd(pod);
          const rate = effectiveRunPodRate(pod);
          return [
            pod.status,
            pod.runpodPodId ?? pod.id.slice(0, 8),
            pod.agentRunId ? <Link key={pod.agentRunId} href={`/agent/${pod.agentRunId}`} className="hover:underline">{pod.agentRunId.slice(0, 8)}</Link> : '',
            spend == null ? 'pending' : formatUsd(spend),
            formatUsdPerHour(rate),
            pod.lastError?.slice(0, 120) ?? '',
          ];
        })}
      />
    </div>
  );
}

function Summary({ title, rows }: { title: string; rows: Array<[string, number]> }) {
  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">{title}</h2>
      <dl className="mt-3 space-y-1">
        {rows.length === 0 ? (
          <div className="text-sm text-[--color-muted]">empty</div>
        ) : (
          rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 text-sm">
              <dt>{label}</dt>
              <dd className="font-mono text-xs">{value}</dd>
            </div>
          ))
        )}
      </dl>
    </section>
  );
}

function Table({
  title,
  headers,
  rows,
}: {
  title: string;
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-[--color-border]">
      <div className="border-b border-[--color-border] bg-[--color-muted-bg] px-4 py-2 text-sm font-medium">
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[--color-muted-bg] text-xs uppercase tracking-wide text-[--color-muted]">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-2 font-medium">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[--color-border]">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-[--color-muted]" colSpan={headers.length}>empty</td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="max-w-[28rem] px-4 py-2 align-top">{cell}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
