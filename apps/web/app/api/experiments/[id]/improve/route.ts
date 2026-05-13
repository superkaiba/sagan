import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, comments, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { collectEntityParticipantUserIds, notifyUsers } from '@/lib/notifications';

const QUEUED_CHANNEL = 'agent_run_queued';

/**
 * Owner-fires-Improve for an experiment in `reviewing` status. Mirrors
 * `/api/narratives/[id]/improve` but the agent_run's request body is prefixed
 * with `experiment-improve-for:<id>` so services/runner/src/session.ts loads
 * the full subagent fleet (including pod-provisioner) — Quick follow-ups
 * folded into this run may spawn pods for small training runs.
 *
 *  - GET  → status: unresolved-comment count + any in-flight improve run.
 *  - POST → bundle all unresolved (kind != 'todo') comments + the body of every
 *           kind='todo' comment whose id is in `quickFollowupCommentIds` into
 *           one agent_run with kind='apply'. Marks each addressed comment with
 *           the new run's agent_run_id. pg_notifies the runner.
 */

const REQUEST_PREFIX = 'experiment-improve-for:';

const postSchema = z.object({
  quickFollowupCommentIds: z.array(z.string().uuid()).max(50).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const rows = await db().select({ id: experiments.id }).from(experiments).where(eq(experiments.id, id)).limit(1);
  if (!rows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Unresolved anchored comments — excludes kind='todo' (follow-up proposals).
  const unresolved = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.entityKind, 'experiment'),
        eq(comments.entityId, id),
        isNull(comments.resolvedAt),
        sql`${comments.kind} <> 'todo'`,
      ),
    );
  const unresolvedCommentCount = unresolved[0]?.count ?? 0;

  const pendingRuns = await db()
    .select({ id: agentRuns.id, status: agentRuns.status, request: agentRuns.request })
    .from(agentRuns)
    .where(and(eq(agentRuns.scopeEntityKind, 'experiment'), eq(agentRuns.scopeEntityId, id)))
    .orderBy(sql`${agentRuns.id} desc`);
  const pendingRunId =
    pendingRuns.find(
      (r) => (r.status === 'queued' || r.status === 'running') && r.request.startsWith(REQUEST_PREFIX),
    )?.id ?? null;

  return NextResponse.json({ unresolvedCommentCount, pendingRunId });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id: experimentId } = await ctx.params;
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const quickIds = parsed.data.quickFollowupCommentIds ?? [];

  const expRows = await db()
    .select({ id: experiments.id, title: experiments.title, number: experiments.number, status: experiments.status })
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1);
  const experiment = expRows[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (experiment.status !== 'reviewing') {
    return NextResponse.json(
      { error: 'invalid_status', detail: `experiment is in '${experiment.status}', not 'reviewing'` },
      { status: 409 },
    );
  }

  // Refuse if a prior experiment-improve run is still queued/running.
  const existing = await db()
    .select({ id: agentRuns.id, status: agentRuns.status, request: agentRuns.request })
    .from(agentRuns)
    .where(and(eq(agentRuns.scopeEntityKind, 'experiment'), eq(agentRuns.scopeEntityId, experimentId)));
  if (
    existing.some(
      (r) => (r.status === 'queued' || r.status === 'running') && r.request.startsWith(REQUEST_PREFIX),
    )
  ) {
    return NextResponse.json({ error: 'improve_already_in_flight' }, { status: 409 });
  }

  const anchoredComments = await db()
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.entityKind, 'experiment'),
        eq(comments.entityId, experimentId),
        isNull(comments.resolvedAt),
        sql`${comments.kind} <> 'todo'`,
      ),
    )
    .orderBy(comments.createdAt);

  const quickFollowups = quickIds.length
    ? await db()
        .select()
        .from(comments)
        .where(
          and(
            eq(comments.entityKind, 'experiment'),
            eq(comments.entityId, experimentId),
            inArray(comments.id, quickIds),
            sql`${comments.kind} = 'todo'`,
            isNull(comments.resolvedAt),
          ),
        )
        .orderBy(comments.createdAt)
    : [];

  if (anchoredComments.length === 0 && quickFollowups.length === 0) {
    return NextResponse.json(
      { error: 'nothing_to_do', detail: 'No unresolved comments and no Quick follow-ups selected.' },
      { status: 400 },
    );
  }

  const commentsBlock =
    anchoredComments.length === 0
      ? '(none)'
      : anchoredComments
          .map(
            (c, i) =>
              `### Comment ${i + 1} (id=${c.id}, by ${c.authorKind}${c.anchoredQuote ? `, anchored to: ${JSON.stringify(c.anchoredQuote)}` : ''})\n${c.body}`,
          )
          .join('\n\n');
  const quickBlock =
    quickFollowups.length === 0
      ? '(none)'
      : quickFollowups
          .map((c, i) => `### Quick follow-up ${i + 1} (id=${c.id})\n${c.body}`)
          .join('\n\n');

  const experimentLabel = experiment.number !== null && experiment.number !== undefined ? `#${experiment.number}` : experimentId.slice(0, 8);

  const runRequest = [
    `${REQUEST_PREFIX}${experimentId}`,
    ``,
    `Address ${anchoredComments.length} unresolved anchored comment(s) and apply ${quickFollowups.length} Quick follow-up(s) inline on experiment ${experimentLabel} (${experiment.title}).`,
    ``,
    `## Anchored comments`,
    ``,
    commentsBlock,
    ``,
    `## Quick follow-ups to handle inline`,
    ``,
    quickBlock,
    ``,
    `## Instructions for the agent`,
    `- Read \`experiments.body\` for experiment ${experimentId}.`,
    `- Revise the body to address every anchored comment and weave each Quick follow-up's result into the appropriate section.`,
    `- For Quick follow-ups that require new compute, spawn the \`pod-provisioner\` subagent with a small pod spec (≤2 GPU-hours of the same hardware class as the parent). Stay within the same Claude session and wait for the pod to finish before continuing.`,
    `- UPDATE the experiments row in place (set body to the revised body, updated_at to now).`,
    `- For each anchored comment, set resolved_at = now(), resolved_by = null, and resolved_summary_md = a one-paragraph summary of how the comment was addressed.`,
    `- For each Quick follow-up comment you addressed, also set resolved_at = now() and resolved_summary_md describing what you did.`,
    `- Set agent_run_id on every comment you addressed to this run's id.`,
    `- Do NOT transition the experiment status. The owner decides when to advance to clean_result_drafting via the dashboard.`,
  ].join('\n');

  const insertedRuns = await db()
    .insert(agentRuns)
    .values({
      kind: 'apply',
      provider: 'claude_code',
      status: 'queued',
      request: runRequest,
      scopeEntityKind: 'experiment',
      scopeEntityId: experimentId,
      approvalRequired: false,
    })
    .returning({ id: agentRuns.id });
  const runId = insertedRuns[0]!.id;

  const addressedIds = [...anchoredComments.map((c) => c.id), ...quickFollowups.map((c) => c.id)];
  if (addressedIds.length > 0) {
    await db()
      .update(comments)
      .set({ agentRunId: runId, updatedAt: new Date() })
      .where(inArray(comments.id, addressedIds));
  }

  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);

  const participants = await collectEntityParticipantUserIds({ entityKind: 'experiment', entityId: experimentId });
  await notifyUsers({
    userIds: [session.user.id, ...participants],
    kind: 'claude_started',
    title: `Claude is improving experiment ${experimentLabel}`,
    body: `Addressing ${anchoredComments.length} comment(s) and ${quickFollowups.length} Quick follow-up(s). Run ${runId.slice(0, 8)}.`,
    entityKind: 'experiment',
    entityId: experimentId,
    agentRunId: runId,
  });

  await appendDailyLogTrailBestEffort({
    action: `Queued experiment improve run (${runId.slice(0, 8)}) — ${anchoredComments.length} comments + ${quickFollowups.length} Q`,
    why: `Owner clicked Improve on experiment ${experimentLabel} to batch-address review feedback.`,
    entityKind: 'experiment',
    entityId: experimentId,
    detail: addressedIds.map((id) => id.slice(0, 8)).join(', '),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: runId,
  });

  return NextResponse.json({
    runId,
    addressedCommentCount: anchoredComments.length,
    addressedQuickCount: quickFollowups.length,
  });
}
