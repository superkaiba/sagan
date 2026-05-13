import { NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { agentRuns, comments, experiments, users } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { db } from '@/lib/db';
import { setExperimentStatus } from '@/lib/workflow';

const QUEUED_CHANNEL = 'agent_run_queued';
const PIPELINE_CHANNEL = 'pipeline_changed';
const ACTIVE_RUN_STATUSES = ['queued', 'running', 'awaiting_approval', 'approved', 'deploying'] as const;

// Re-dispatch the planner agent for an experiment that is parked waiting on
// owner input — either awaiting_clarifications (Claude asked questions) or
// plan_pending (a plan is drafted and awaiting approval). The owner answers
// in comments, then hits this endpoint. We:
//   1. Cancel any in-flight planner run so the queue-dedupe doesn't trip.
//   2. Compose a request that includes the prior plan output and any
//      unresolved comments so the planner can read the answers.
//   3. Queue a fresh experiment-kind agent run.
//   4. Move the experiment back to clarifying/planning so the column reflects
//      that the work is in progress again.
// The planner can then either produce more clarifying questions (→ back to
// awaiting_clarifications) or a full plan (→ awaiting_approval), via the
// existing markAwaitingApproval routing in services/runner/src/session.ts.

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const expRows = await db()
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      status: experiments.status,
    })
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);
  const experiment = expRows[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // planMd lives on agent_runs (not experiments) — pull the most recent
  // experiment-scoped planner run's output so the new run sees the same
  // context Claude already produced.
  const priorPlanRow = await db()
    .select({ planMd: agentRuns.planMd })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, 'experiment'),
        eq(agentRuns.scopeEntityId, id),
        eq(agentRuns.kind, 'experiment'),
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  const priorPlanMd = priorPlanRow[0]?.planMd ?? null;

  if (experiment.status !== 'awaiting_clarifications' && experiment.status !== 'plan_pending') {
    return NextResponse.json(
      {
        error: 'wrong_status',
        message: `Re-dispatching the planner only makes sense from awaiting_clarifications or plan_pending; this experiment is ${experiment.status}.`,
      },
      { status: 409 },
    );
  }

  // Cancel any active planner run so queueAgentRun doesn't dedupe back to it.
  const activeRuns = await db()
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, 'experiment'),
        eq(agentRuns.scopeEntityId, id),
        inArray(agentRuns.status, [...ACTIVE_RUN_STATUSES]),
      ),
    );
  for (const run of activeRuns) {
    await db()
      .update(agentRuns)
      .set({ status: 'cancelled', updatedAt: new Date(), completedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
  }

  // Pull unresolved comments and Claude's previous plan output so the new
  // planner run sees the owner's answers in its starting message.
  const threadRows = await db()
    .select({
      id: comments.id,
      authorKind: comments.authorKind,
      authorUserId: comments.authorUserId,
      authorName: users.displayName,
      body: comments.body,
      anchoredQuote: comments.anchoredQuote,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorUserId))
    .where(
      and(
        eq(comments.entityKind, 'experiment'),
        eq(comments.entityId, id),
        isNull(comments.resolvedAt),
      ),
    )
    .orderBy(asc(comments.createdAt));

  const commentsBlock = threadRows.length
    ? threadRows
        .map((c, i) => {
          const who = c.authorKind === 'human' ? (c.authorName ?? 'owner') : 'claude';
          const anchor = c.anchoredQuote ? `\nAnchored to: "${c.anchoredQuote.slice(0, 200)}"` : '';
          return `### Comment ${i + 1} — ${who} @ ${c.createdAt.toISOString()}${anchor}\n${c.body}`;
        })
        .join('\n\n')
    : '(no unresolved comments — owner answered elsewhere; re-read the experiment body and prior plan output.)';

  const heading =
    experiment.status === 'awaiting_clarifications'
      ? 'Owner answered your clarifying questions. Re-read the experiment record and the unresolved comments below, then decide:\n' +
        '- If the answers fully unblock planning, produce a full experiment plan (runpod-spec block + ## Approval Checklist section).\n' +
        '- If anything material is still ambiguous, post only the few remaining targeted clarifying questions instead.\n\n' +
        'Do not invent new requirements. Use the existing experiment body as the source of truth for scope.'
      : 'Owner left feedback on your drafted plan. Re-read the existing plan and the unresolved comments below, then either:\n' +
        '- Produce a revised full plan (runpod-spec block + ## Approval Checklist section) that incorporates the feedback, or\n' +
        '- Post targeted clarifying questions if the feedback needs further input before re-planning.';

  const priorPlanBlock = priorPlanMd
    ? `## Prior plan output\n\n${priorPlanMd}`
    : '(no prior plan output recorded on this experiment)';

  const request = [
    heading,
    '',
    '## Unresolved comments on this experiment',
    '',
    commentsBlock,
    '',
    priorPlanBlock,
  ].join('\n');

  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind: 'experiment',
      provider: 'claude_code',
      status: 'queued',
      request,
      scopeEntityKind: 'experiment',
      scopeEntityId: id,
      approvalRequired: true,
    })
    .returning({ id: agentRuns.id });
  const runId = inserted[0]!.id;

  const nextStatus =
    experiment.status === 'awaiting_clarifications' ? 'clarifying' : 'planning';
  await setExperimentStatus({
    experimentId: id,
    status: nextStatus,
    actorUserId: session.user.id,
    note: `Owner re-dispatched the planner from ${experiment.status}.`,
  });

  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
  await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${`experiment:${id}:${nextStatus}`})`);

  await appendDailyLogTrailBestEffort({
    action: `Re-dispatched planner for experiment ${experiment.title.slice(0, 80)}`,
    why: `Owner answered comments and asked the planner to continue from ${experiment.status}.`,
    entityKind: 'experiment',
    entityId: id,
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: runId,
    correlationId: runId,
  });

  return NextResponse.json({ ok: true, agentRunId: runId, message: 'Planner re-dispatched.' });
}
