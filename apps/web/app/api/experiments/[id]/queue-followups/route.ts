import { agentDispatchEnabled, agentDispatchDisabledResponse } from '@/lib/agent-dispatch';
import { NextResponse } from 'next/server';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { comments, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { grantDefaultMentorMembership } from '@/lib/default-memberships';
import { appendWorkflowEvent, experimentTurn, setExperimentStatus } from '@/lib/workflow';

/**
 * Owner queues T-checked follow-up proposals as new child experiments.
 *
 * Each kind='todo' comment whose id is in `todoFollowupCommentIds` is read as
 * a follow-up proposal (first line → title, full body → request body). One
 * new experiments row is inserted per id with:
 *
 *   - parent_experiment_id = <parent>
 *   - status = 'planning' (planner agent will draft a plan, owner still
 *     approves before it runs — but clarification is skipped because the
 *     proposal text already has the rationale)
 *   - kind / compute_size inherited from the parent
 *
 * The parent experiment transitions from `reviewing` to `followups_running`
 * so the dashboard pipeline reflects that follow-ups are in flight. The
 * runner's followups loop-back watcher (slice 4) re-enters interpreting once
 * all children with this parent_experiment_id reach a terminal status.
 */

const postSchema = z.object({
  todoFollowupCommentIds: z.array(z.string().uuid()).min(1).max(20),
});

function firstLine(body: string): string {
  return (body.split(/\r?\n/, 1)[0] ?? '').replace(/^[#*\s-]+/, '').trim();
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentDispatchEnabled) return agentDispatchDisabledResponse();
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id: parentId } = await ctx.params;
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const parentRows = await db()
    .select({
      id: experiments.id,
      title: experiments.title,
      number: experiments.number,
      status: experiments.status,
      kind: experiments.kind,
      computeSize: experiments.computeSize,
      projectId: experiments.projectId,
      priority: experiments.priority,
      runpodAccount: experiments.runpodAccount,
    })
    .from(experiments)
    .where(eq(experiments.id, parentId))
    .limit(1);
  const parent = parentRows[0];
  if (!parent) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (parent.status !== 'reviewing') {
    return NextResponse.json(
      { error: 'invalid_status', detail: `parent is in '${parent.status}', not 'reviewing'` },
      { status: 409 },
    );
  }

  const todoRows = await db()
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.entityKind, 'experiment'),
        eq(comments.entityId, parentId),
        inArray(comments.id, parsed.data.todoFollowupCommentIds),
        sql`${comments.kind} = 'todo'`,
        isNull(comments.resolvedAt),
      ),
    );
  if (todoRows.length === 0) {
    return NextResponse.json({ error: 'no_matching_proposals' }, { status: 400 });
  }

  const created: Array<{ id: string; title: string }> = [];
  for (const todo of todoRows) {
    const title = firstLine(todo.body).slice(0, 200) || `Follow-up of ${parent.title.slice(0, 100)}`;
    const inserted = await db()
      .insert(experiments)
      .values({
        title,
        body: todo.body,
        kind: parent.kind,
        computeSize: parent.computeSize,
        priority: parent.priority,
        projectId: parent.projectId,
        runpodAccount: parent.runpodAccount,
        status: 'planning',
        parentExperimentId: parentId,
        autoApprovePlan: false,
        planJson: {
          createdFrom: 'review_panel_followup',
          parentExperimentId: parentId,
          sourceCommentId: todo.id,
          proposedByUserId: session.user.id,
        },
      })
      .returning({ id: experiments.id, title: experiments.title });
    const child = inserted[0]!;
    created.push(child);
    await grantDefaultMentorMembership('experiment', child.id, session.user.id);

    // Resolve the source comment so it no longer shows in the Q/T panel.
    await db()
      .update(comments)
      .set({
        resolvedAt: new Date(),
        resolvedBy: session.user.id,
        resolvedSummaryMd: `Promoted to child experiment ${child.id.slice(0, 8)} (${child.title.slice(0, 80)}).`,
        updatedAt: new Date(),
      })
      .where(eq(comments.id, todo.id));

    await appendWorkflowEvent({
      entityKind: 'experiment',
      entityId: child.id,
      eventType: 'created',
      toStatus: 'planning',
      actorKind: 'user',
      actorUserId: session.user.id,
      note: `Created as follow-up of ${parent.number !== null ? `#${parent.number}` : parentId.slice(0, 8)} from the review panel.`,
      metadata: {
        parentExperimentId: parentId,
        sourceCommentId: todo.id,
        turn: experimentTurn('planning'),
      },
    });
  }

  // Transition parent to followups_running so the dashboard locks review actions.
  await setExperimentStatus({
    experimentId: parentId,
    status: 'followups_running',
    actorUserId: session.user.id,
    note: `Queued ${created.length} owner-proposed follow-up(s) from review panel.`,
  });

  await appendDailyLogTrailBestEffort({
    action: `Queued ${created.length} follow-up experiment(s) from review of ${parent.number !== null ? `#${parent.number}` : parent.title.slice(0, 80)}`,
    why: `Owner picked T (todo) on ${created.length} proposed follow-up(s); parent moved to followups_running.`,
    entityKind: 'experiment',
    entityId: parentId,
    detail: created.map((c) => `${c.id.slice(0, 8)}: ${c.title.slice(0, 80)}`).join('\n'),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: parentId,
  });

  return NextResponse.json({ children: created });
}
