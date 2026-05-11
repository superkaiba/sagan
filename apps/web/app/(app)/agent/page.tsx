import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { agentRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { DispatchForm } from './DispatchForm';

export const dynamic = 'force-dynamic';

const STATUS_COLORS: Record<string, string> = {
  queued: 'oklch(0.85 0.05 250)',
  running: 'oklch(0.85 0.10 90)',
  awaiting_approval: 'oklch(0.85 0.12 50)',
  approved: 'oklch(0.85 0.10 150)',
  deploying: 'oklch(0.85 0.10 200)',
  blocked: 'oklch(0.85 0.12 45)',
  completed: 'oklch(0.85 0.12 150)',
  failed: 'oklch(0.85 0.15 25)',
  cancelled: 'oklch(0.80 0.02 270)',
  rejected: 'oklch(0.80 0.10 20)',
};

export default async function AgentPage() {
  const runs = await db()
    .select()
    .from(agentRuns)
    .orderBy(desc(agentRuns.createdAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
        <p className="text-sm text-[--color-muted]">{runs.length} recent run{runs.length === 1 ? '' : 's'}</p>
      </header>

      <DispatchForm />

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Runs
        </h2>
        <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
          {runs.length === 0 ? (
            <p className="p-4 text-sm text-[--color-muted]">No runs yet.</p>
          ) : (
            runs.map((run) => (
              <Link
                key={run.id}
                href={`/agent/${run.id}`}
                className="flex items-baseline gap-3 p-3 hover:bg-[--color-muted-bg]"
              >
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ background: STATUS_COLORS[run.status] ?? 'oklch(0.85 0.02 270)', color: 'oklch(0.20 0.04 270)' }}
                >
                  {run.status}
                </span>
                <span className="text-xs uppercase tracking-wide text-[--color-muted]">{run.kind}</span>
                <span className="flex-1 text-sm truncate">{run.request}</span>
                <span className="text-xs text-[--color-muted]">
                  {new Date(run.createdAt).toLocaleTimeString()}
                </span>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
