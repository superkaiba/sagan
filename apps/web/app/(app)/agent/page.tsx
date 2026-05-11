import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { Bot, CircleAlert, Play, Server } from 'lucide-react';
import { agentRuns } from '@sagan/db/schema';
import { EmptyState, ListRow, MetricTile, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { formatRelativeTime } from '@/lib/status';
import { DispatchForm } from './DispatchForm';

export const dynamic = 'force-dynamic';

export default async function AgentPage() {
  const runs = await db().select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(80);
  const awaiting = runs.filter((run) => run.status === 'awaiting_approval').length;
  const active = runs.filter((run) => ['queued', 'approved', 'deploying', 'running'].includes(run.status)).length;
  const failed = runs.filter((run) => ['failed', 'blocked'].includes(run.status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automation"
        description="Agent dispatch, run inspection, failures, and admin-only operational detail."
        meta={`${runs.length} recent runs`}
        actions={
          <Link href="/admin/health" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            <Server className="h-4 w-4" aria-hidden="true" />
            Health
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Awaiting approval" value={awaiting} tone={awaiting > 0 ? 'approval' : 'neutral'} icon={<CircleAlert className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Active" value={active} tone={active > 0 ? 'info' : 'neutral'} icon={<Play className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Blocked or failed" value={failed} tone={failed > 0 ? 'danger' : 'neutral'} />
      </section>

      <DispatchForm />

      <Panel className="overflow-hidden">
        <div className="flex min-h-12 items-center justify-between border-b border-[--color-border] px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">Runs</h2>
          <Link href="/approvals" className="text-sm font-medium text-[--color-accent] hover:underline">
            Approvals
          </Link>
        </div>
        {runs.length === 0 ? (
          <EmptyState
            icon={<Bot className="h-5 w-5" aria-hidden="true" />}
            title="No automation runs"
            message="Dispatched runs will appear here with status, request text, and run detail links."
          />
        ) : (
          <div className="divide-y divide-[--color-border]">
            {runs.map((run) => (
              <ListRow
                key={run.id}
                href={`/agent/${run.id}`}
                leading={<Bot className="h-4 w-4" aria-hidden="true" />}
                title={run.request}
                detail={run.scopeEntityKind && run.scopeEntityId ? `${run.scopeEntityKind} ${run.scopeEntityId.slice(0, 8)}` : run.kind}
                meta={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <StatusBadge status={run.status} />
                    <span>{run.kind}</span>
                    <span>{formatRelativeTime(run.updatedAt)}</span>
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
