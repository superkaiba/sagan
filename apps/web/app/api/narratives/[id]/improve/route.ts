import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { agentRuns, comments, projectNarratives } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import {
  collectEntityParticipantUserIds,
  notifyUsers,
} from '@/lib/notifications';

const QUEUED_CHANNEL = 'agent_run_queued';

/**
 * GET — status: count of unresolved comments + any in-flight improve run.
 * POST — batch all unresolved comments into a single agent_run; mark each
 * comment's agent_run_id; pg_notify the runner; notify participants.
 */

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Validate narrative exists
  const narrativeRows = await db()
    .select({ id: projectNarratives.id })
    .from(projectNarratives)
    .where(eq(projectNarratives.id, id))
    .limit(1);
  if (!narrativeRows[0]) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Count unresolved comments
  const unresolved = await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.entityKind, 'project_narrative'),
        eq(comments.entityId, id),
        isNull(comments.resolvedAt),
      ),
    );
  const unresolvedCommentCount = unresolved[0]?.count ?? 0;

  // Find pending agent_run for this narrative
  const pendingRuns = await db()
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, 'project_narrative'),
        eq(agentRuns.scopeEntityId, id),
      ),
    )
    .orderBy(sql`${agentRuns.id} desc`);
  const pendingRunId =
    pendingRuns.find((r) => r.status === 'queued' || r.status === 'running')?.id ?? null;

  return NextResponse.json({ unresolvedCommentCount, pendingRunId });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id: narrativeId } = await ctx.params;

  // Load narrative
  const narrativeRows = await db()
    .select()
    .from(projectNarratives)
    .where(eq(projectNarratives.id, narrativeId))
    .limit(1);
  const narrative = narrativeRows[0];
  if (!narrative) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // Collect unresolved comments for this narrative
  const unresolved = await db()
    .select()
    .from(comments)
    .where(
      and(
        eq(comments.entityKind, 'project_narrative'),
        eq(comments.entityId, narrativeId),
        isNull(comments.resolvedAt),
      ),
    )
    .orderBy(comments.createdAt);

  if (unresolved.length === 0) {
    return NextResponse.json({ error: 'no_unresolved_comments' }, { status: 400 });
  }

  // Refuse if an improve run is already queued or running
  const existing = await db()
    .select({ id: agentRuns.id, status: agentRuns.status })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, 'project_narrative'),
        eq(agentRuns.scopeEntityId, narrativeId),
      ),
    );
  if (existing.some((r) => r.status === 'queued' || r.status === 'running')) {
    return NextResponse.json({ error: 'improve_already_in_flight' }, { status: 409 });
  }

  // Build the agent request — narrative body + all unresolved comments
  const commentsBlock = unresolved
    .map((c, i) => `### Comment ${i + 1} (id=${c.id}, by ${c.authorKind})\n${c.body}`)
    .join('\n\n');
  const runRequest = [
    `Address the following ${unresolved.length} unresolved comment(s) on a project narrative.`,
    `Produce a revised version of the narrative body that incorporates the feedback.`,
    ``,
    `## Current narrative (id=${narrative.id}, title=${narrative.title})`,
    ``,
    narrative.bodyMd,
    ``,
    `## Unresolved comments`,
    ``,
    commentsBlock,
    ``,
    `## Instructions for the agent`,
    `- Read the narrative and all unresolved comments.`,
    `- Produce a revised narrative body that addresses each comment.`,
    `- UPDATE the project_narratives row in place (set body_md to the revised body, set updated_at).`,
    `- For each comment, set resolved_at = now(), resolved_by = the agent's user id (or null), and resolved_summary_md = a one-paragraph summary of how the comment was addressed.`,
    `- Set agent_run_id on each comment to this run's id.`,
    `- Do NOT publish — leave the narrative in its current status (draft or published; revisions are in place).`,
  ].join('\n');

  // Insert the agent_run
  const insertedRuns = await db()
    .insert(agentRuns)
    .values({
      kind: 'qa',
      provider: 'claude_code',
      status: 'queued',
      request: runRequest,
      scopeEntityKind: 'project_narrative',
      scopeEntityId: narrativeId,
      approvalRequired: false,
    })
    .returning({ id: agentRuns.id });
  const runId = insertedRuns[0]!.id;

  // Mark each comment with this agent_run_id
  for (const c of unresolved) {
    await db()
      .update(comments)
      .set({ agentRunId: runId, updatedAt: new Date() })
      .where(eq(comments.id, c.id));
  }

  // Notify the runner
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);

  // Notify participants
  const participants = await collectEntityParticipantUserIds({
    entityKind: 'project_narrative',
    entityId: narrativeId,
  });
  await notifyUsers({
    userIds: [session.user.id, ...participants],
    kind: 'claude_started',
    title: `Claude is addressing ${unresolved.length} comment${unresolved.length === 1 ? '' : 's'} on narrative`,
    body: `Improve run queued (${runId.slice(0, 8)}). The narrative will be revised to address the feedback.`,
    entityKind: 'project_narrative',
    entityId: narrativeId,
    agentRunId: runId,
  });

  await appendDailyLogTrailBestEffort({
    action: `Queued narrative improve run (${runId.slice(0, 8)}) — ${unresolved.length} comments`,
    why: `User clicked Improve to batch-address comments on project narrative ${narrativeId}.`,
    entityKind: 'project_narrative',
    entityId: narrativeId,
    detail: unresolved
      .map((c) => `${c.id.slice(0, 8)}: ${c.body.slice(0, 100)}`)
      .join('\n'),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: runId,
  });

  return NextResponse.json({
    runId,
    unresolvedCommentCount: unresolved.length,
  });
}
