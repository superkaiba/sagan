import Link from 'next/link';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { agentRuns, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { MarkdownWithTextboxes } from '@/components/MarkdownWithTextboxes';
import { PlanWithComments } from '@/components/PlanWithComments';

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
  experimentStatus,
}: {
  entityKind: string;
  entityId: string;
  experimentStatus?: string | null;
}) {
  let planMd: string | null = null;
  let runId: string | null = null;
  let runStatus: string | null = null;

  if (entityKind === 'experiment') {
    // Experiment plan lives on the experiment row (since 0029). The agent_run
    // query below just picks up the latest associated run for the approval
    // link; it no longer carries the plan content.
    const expRows = await db()
      .select({ planMd: experiments.planMd })
      .from(experiments)
      .where(eq(experiments.id, entityId))
      .limit(1);
    planMd = expRows[0]?.planMd ?? null;

    const runRows = await db()
      .select({ id: agentRuns.id, kind: agentRuns.kind, status: agentRuns.status })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.scopeEntityKind, 'experiment'),
          eq(agentRuns.scopeEntityId, entityId),
          eq(agentRuns.kind, 'experiment'),
          ne(agentRuns.status, 'failed'),
        ),
      )
      .orderBy(desc(agentRuns.updatedAt))
      .limit(1);
    const run = runRows[0];
    if (run) {
      runId = run.id;
      runStatus = run.status;
    }
  } else {
    // Todos still keep plan_md on the agent_run row.
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
          eq(agentRuns.scopeEntityKind, entityKind as 'todo'),
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
      planMd = run.planMd;
    }
  }

  if (!planMd) return null;

  const awaitingApproval = runStatus === 'awaiting_approval';
  // Plan-pending and awaiting-approval experiments accept inline comments +
  // a one-shot Revise. After approval the plan becomes read-only history.
  const canRevise =
    entityKind === 'experiment' &&
    (experimentStatus === 'plan_pending' || experimentStatus === 'awaiting_approval');
  const showCommentable = entityKind === 'experiment';

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[--color-border] px-4 py-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Plan</h2>
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
        {showCommentable ? (
          <PlanWithComments
            experimentId={entityId}
            planMd={planMd}
            canRevise={canRevise}
          />
        ) : (
          <MarkdownWithTextboxes
            body={planMd}
            entityKind={entityKind as 'experiment' | 'todo'}
            entityId={entityId}
            source="plan"
          />
        )}
      </div>
    </section>
  );
}
