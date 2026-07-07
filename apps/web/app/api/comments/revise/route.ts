import { agentDispatchEnabled, agentDispatchDisabledResponse } from '@/lib/agent-dispatch';
import { NextResponse } from 'next/server';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, comments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { ENTITY_KINDS, loadEntity, type EntityKind } from '@/lib/entity';
import { requireOwner } from '@/lib/access';
import { collectEntityParticipantUserIds, notifyUsers } from '@/lib/notifications';

const QUEUED_CHANNEL = 'agent_run_queued';
const RUNNING_STATUSES = ['queued', 'running', 'approved', 'deploying', 'awaiting_approval'] as const;

const reviseSchema = z.object({
  entityKind: z.enum(ENTITY_KINDS as [EntityKind, ...EntityKind[]]),
  entityId: z.string().uuid(),
});

export async function POST(req: Request) {
  if (!agentDispatchEnabled) return agentDispatchDisabledResponse();
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = reviseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const { entityKind, entityId } = parsed.data;
  const entity = await loadEntity(entityKind, entityId);
  if (!entity) {
    return NextResponse.json({ error: 'entity_not_found_or_not_revisable' }, { status: 404 });
  }

  const unresolved = await db()
    .select()
    .from(comments)
    .where(and(eq(comments.entityKind, entityKind), eq(comments.entityId, entityId), isNull(comments.resolvedAt)))
    .orderBy(asc(comments.createdAt));

  if (unresolved.length === 0) {
    return NextResponse.json({ error: 'no_unresolved_comments' }, { status: 400 });
  }

  const existing = await db()
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.kind, 'apply'),
        eq(agentRuns.scopeEntityKind, entityKind),
        eq(agentRuns.scopeEntityId, entityId),
        inArray(agentRuns.status, [...RUNNING_STATUSES]),
      ),
    )
    .limit(1);
  if (existing[0]) {
    return NextResponse.json({ error: 'revise_already_in_flight', runId: existing[0].id }, { status: 409 });
  }

  const commentsBlock = unresolved
    .map((comment, index) => {
      const selectedText = comment.anchoredQuote?.trim()
        ? [`Selected text:`, blockquote(comment.anchoredQuote.trim()), ``].join('\n')
        : 'Selected text: (none)\n';
      return [
        `### Comment ${index + 1}`,
        `id: ${comment.id}`,
        `parent_comment_id: ${comment.parentCommentId ?? '(root)'}`,
        `author: ${comment.authorKind}`,
        selectedText,
        `Comment:`,
        blockquote(comment.body),
      ].join('\n');
    })
    .join('\n\n');

  const runRequest = [
    `Revise this Sagan record to address all unresolved comments.`,
    `Entity: ${entityKind} ${entityId}`,
    `Title: ${entity.title}`,
    entity.status ? `Status: ${entity.status}` : null,
    ``,
    `## Current body`,
    ``,
    entity.body?.trim() ? entity.body : '(empty)',
    ``,
    `## Unresolved comments`,
    ``,
    commentsBlock,
    ``,
    `## Instructions`,
    `- Use the selected text for each comment to locate the exact passage being discussed.`,
    `- Revise the record in place in the database. Preserve the existing format unless a comment asks for a structural change.`,
    `- For project_narrative update project_narratives.body_md.`,
    `- For clean_result update clean_results.body_md, and update title/claim/confidence only if the comments require it.`,
    `- For weekly_digest, daily_log_entry, todo, run, experiment, project, belief, or lit_item, update the main text/body field that this page displays.`,
    `- Do not publish, share, archive, delete, or change unrelated status fields.`,
    `- After revising, mark each addressed comment resolved: set resolved_at = now(), resolved_summary_md to a brief description of the change, updated_at = now(), and keep agent_run_id set to this run id.`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind: 'apply',
      provider: 'claude_code',
      status: 'queued',
      request: runRequest,
      scopeEntityKind: entityKind,
      scopeEntityId: entityId,
      approvalRequired: false,
    })
    .returning({ id: agentRuns.id });
  const runId = inserted[0]!.id;

  await db()
    .update(comments)
    .set({ agentRunId: runId, updatedAt: new Date() })
    .where(and(eq(comments.entityKind, entityKind), eq(comments.entityId, entityId), isNull(comments.resolvedAt)));

  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);

  const participants = await collectEntityParticipantUserIds({ entityKind, entityId });
  await notifyUsers({
    userIds: [session.user.id, ...participants],
    kind: 'claude_started',
    title: `Claude started revising ${entity.title}`,
    body: `Queued revise run ${runId.slice(0, 8)} for ${unresolved.length} unresolved comment${unresolved.length === 1 ? '' : 's'}.`,
    entityKind,
    entityId,
    agentRunId: runId,
  });

  await appendDailyLogTrailBestEffort({
    action: `Queued revise run (${runId.slice(0, 8)}) — ${unresolved.length} comments`,
    why: `User clicked Revise to address unresolved comments on ${entityKind} ${entityId}.`,
    entityKind,
    entityId,
    detail: unresolved
      .map((comment) => `${comment.id.slice(0, 8)}${comment.anchoredQuote ? ` [${comment.anchoredQuote.slice(0, 80)}]` : ''}: ${comment.body.slice(0, 120)}`)
      .join('\n'),
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: runId,
    correlationId: runId,
  });

  return NextResponse.json({ runId, unresolvedCommentCount: unresolved.length });
}

function blockquote(value: string) {
  return value
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}
