import Link from 'next/link';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { agentRuns, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { MarkdownWithTextboxes } from '@/components/MarkdownWithTextboxes';
import { StatusBadge } from '@/components/ui';

/**
 * Persistent "Plan" section for the entity page. Sits in the main column
 * (alongside the body and clarifications), not buried inside the agent log.
 * Renders the canonical plan_md for an experiment or todo regardless of
 * lifecycle stage — once a plan is drafted it stays on the card. When the
 * latest plan-kind run is in awaiting_approval, the header surfaces a
 * "Review and approve" link to /agent/<runId>.
 */
export async function PlanPanel({
  entityKind,
  entityId,
}: {
  entityKind: string;
  entityId: string;
}) {
  let planMd: string | null = null;
  let runId: string | null = null;
  let runStatus: string | null = null;
  let runKind: string | null = null;

  if (entityKind === 'experiment') {
    const expRows = await db()
      .select({ planMd: experiments.planMd })
      .from(experiments)
      .where(eq(experiments.id, entityId))
      .limit(1);
    planMd = expRows[0]?.planMd ?? null;
  }

  // Always look up the most recent non-failed run with a populated plan_md so
  // we can show its status and link to /agent/<id> for approval. For todos
  // this is also where plan_md itself comes from.
  const runRows = await db()
    .select({
      id: agentRuns.id,
      kind: agentRuns.kind,
      status: agentRuns.status,
      planMd: agentRuns.planMd,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, entityKind as 'experiment' | 'todo'),
        eq(agentRuns.scopeEntityId, entityId),
        ne(agentRuns.status, 'failed'),
        sql`${agentRuns.planMd} IS NOT NULL AND length(${agentRuns.planMd}) > 0`,
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  const run = runRows[0];
  if (run) {
    runId = run.id;
    runStatus = run.status;
    runKind = run.kind;
    if (!planMd) planMd = run.planMd;
  }

  if (!planMd) return null;

  const awaitingApproval = runStatus === 'awaiting_approval';

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[--color-border] px-4 py-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Plan</h2>
        {runStatus ? <StatusBadge status={runStatus} /> : null}
        {runKind ? (
          <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">
            via {runKind} run
          </span>
        ) : null}
        {awaitingApproval && runId ? (
          <Link
            href={`/agent/${runId}`}
            className="ml-auto rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] hover:opacity-90"
          >
            Review and approve →
          </Link>
        ) : runId ? (
          <Link
            href={`/agent/${runId}`}
            className="ml-auto text-xs text-[--color-muted] hover:text-[--color-fg]"
          >
            Open run →
          </Link>
        ) : null}
      </header>
      <div className="px-4 py-3">
        <MarkdownWithTextboxes
          body={planMd}
          entityKind={entityKind as 'experiment' | 'todo'}
          entityId={entityId}
          source="plan"
        />
      </div>
    </section>
  );
}
