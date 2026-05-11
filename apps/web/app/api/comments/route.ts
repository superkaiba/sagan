import { NextResponse } from 'next/server';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, chatSessions, comments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isEntityKind } from '@/lib/entity';
import type { EntityKind } from '@/lib/entity';
import { ForbiddenError, requireEntityComment, requireEntityRead } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import {
  collectEntityParticipantUserIds,
  findMentionedUserIds,
  notifyUsers,
  subscribeToCommentThread,
} from '@/lib/notifications';

const QUEUED_CHANNEL = 'agent_run_queued';

export async function GET(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const entityKind = url.searchParams.get('entityKind') ?? '';
  const entityId = url.searchParams.get('entityId') ?? '';
  if (!isEntityKind(entityKind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  try {
    await requireEntityRead(session, entityKind, entityId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  const rows = await db()
    .select()
    .from(comments)
    .where(and(eq(comments.entityKind, entityKind), eq(comments.entityId, entityId)))
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows });
}

const createSchema = z.object({
  entityKind: z.enum([
    'project',
    'belief',
    'experiment',
    'run',
    'clean_result',
    'todo',
    'lit_item',
    'project_narrative',
    'daily_log_entry',
    'weekly_digest',
  ]),
  entityId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
  parentCommentId: z.string().uuid().optional(),
});

const ASK_CLAUDE_RE = /(^|\s)@claude\b/i;

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  try {
    await requireEntityComment(session, parsed.data.entityKind, parsed.data.entityId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const isAskClaude = ASK_CLAUDE_RE.test(parsed.data.body);

  let parentInfo: ResolvedParentComment | null = null;
  if (parsed.data.parentCommentId) {
    const resolved = await resolveParentComment({
      parentCommentId: parsed.data.parentCommentId,
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
    });
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }
    parentInfo = resolved.parent;
  }

  const normalizedParentCommentId = parentInfo?.rootCommentId;
  const autoContinueClaude = Boolean(parentInfo?.autoContinueClaude || isAskClaude);
  const shouldDispatch = isAskClaude || autoContinueClaude;
  const commentContext = shouldDispatch
    ? await buildCommentContext({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        rootCommentId: parentInfo?.rootCommentId,
      })
    : '';

  // Create the human comment first.
  const inserted = await db()
    .insert(comments)
    .values({
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
      parentCommentId: normalizedParentCommentId,
      authorUserId: session.user.id,
      authorKind: 'human',
      kind: isAskClaude ? 'ask_claude' : 'discussion',
      body: parsed.data.body,
      autoContinueClaude,
    })
    .returning();
  const comment = inserted[0]!;
  const rootCommentId = normalizedParentCommentId ?? comment.id;
  if (isAskClaude && normalizedParentCommentId && !parentInfo?.autoContinueClaude) {
    await db()
      .update(comments)
      .set({ autoContinueClaude: true, updatedAt: new Date() })
      .where(eq(comments.id, normalizedParentCommentId));
  }
  await subscribeToCommentThread({
    userId: session.user.id,
    entityKind: parsed.data.entityKind,
    entityId: parsed.data.entityId,
    rootCommentId,
    reason: isAskClaude ? 'asked_claude' : 'commented',
  });
  await subscribeMentionedUsers({
    body: parsed.data.body,
    entityKind: parsed.data.entityKind,
    entityId: parsed.data.entityId,
    rootCommentId,
  });
  await notifyCommentParticipants({
    actorUserId: session.user.id,
    entityKind: parsed.data.entityKind,
    entityId: parsed.data.entityId,
    rootCommentId,
    commentId: comment.id,
    body: parsed.data.body,
    kind: 'comment',
  });

  if (shouldDispatch) {
    try {
      const chatSessionId = await loadOrCreateCommentChatSession({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        rootCommentId,
        userId: session.user.id,
      });
      const runRequest = [
        `Reply to the latest comment on ${parsed.data.entityKind} ${parsed.data.entityId}.`,
        commentContext,
        `Latest message (user):\n\n${parsed.data.body}`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const run = await db()
        .insert(agentRuns)
        .values({
          kind: 'qa',
          provider: 'claude_code',
          status: 'queued',
          request: runRequest,
          scopeEntityKind: parsed.data.entityKind,
          scopeEntityId: parsed.data.entityId,
          chatSessionId,
          approvalRequired: false,
        })
        .returning({ id: agentRuns.id });
      const runId = run[0]!.id;
      await db()
        .update(comments)
        .set({ agentRunId: runId, updatedAt: new Date() })
        .where(eq(comments.id, comment.id));
      await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
      const participants = await collectEntityParticipantUserIds({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        rootCommentId,
      });
      await notifyUsers({
        userIds: [session.user.id, ...participants],
        kind: 'claude_started',
        title: 'Claude started answering',
        body: parsed.data.body.slice(0, 500),
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        commentId: comment.id,
        agentRunId: runId,
      });
      await appendDailyLogTrailBestEffort({
        action: `Asked Claude from a comment thread (${runId.slice(0, 8)})`,
        why: `The comment asked for agent help on ${parsed.data.entityKind} ${parsed.data.entityId}.`,
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        detail: parsed.data.body.slice(0, 500),
        actorKind: 'user',
        actorUserId: session.user.id,
        agentRunId: runId,
        correlationId: runId,
      });
      return NextResponse.json({ comment: { ...comment, agentRunId: runId }, runId, dispatch: { ok: true } });
    } catch (err) {
      const message = dispatchErrorMessage(err);
      await insertSystemReply({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        parentCommentId: rootCommentId,
        body: `Claude dispatch failed after saving the comment: ${message}`,
      });
      await appendDailyLogTrailBestEffort({
        action: 'Claude comment dispatch failed',
        why: `The user asked Claude for help, but the app could not queue the agent run after saving the comment.`,
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        detail: message,
        actorKind: 'system',
      });
      return NextResponse.json(
        { comment, dispatch: { ok: false, error: 'agent_dispatch_failed', message } },
        { status: 202 },
      );
    }
  }

  return NextResponse.json({ comment });
}

async function loadOrCreateCommentChatSession(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
  userId: string;
}) {
  const existing = await db()
    .select({ chatSessionId: agentRuns.chatSessionId })
    .from(comments)
    .innerJoin(agentRuns, eq(comments.agentRunId, agentRuns.id))
    .where(or(eq(comments.id, input.rootCommentId), eq(comments.parentCommentId, input.rootCommentId)))
    .orderBy(desc(agentRuns.createdAt))
    .limit(10);
  const prior = existing.find((row) => row.chatSessionId);
  if (prior?.chatSessionId) return prior.chatSessionId;

  const inserted = await db()
    .insert(chatSessions)
    .values({
      scopeEntityKind: input.entityKind,
      scopeEntityId: input.entityId,
      createdByUserId: input.userId,
      lastMessageAt: new Date(),
    })
    .returning({ id: chatSessions.id });
  return inserted[0]!.id;
}

type ResolvedParentComment = {
  rootCommentId: string;
  autoContinueClaude: boolean;
};

async function resolveParentComment(input: {
  parentCommentId: string;
  entityKind: EntityKind;
  entityId: string;
}): Promise<{ parent: ResolvedParentComment } | { error: string; status: number }> {
  const parentRows = await db()
    .select({
      id: comments.id,
      entityKind: comments.entityKind,
      entityId: comments.entityId,
      parentCommentId: comments.parentCommentId,
      autoContinueClaude: comments.autoContinueClaude,
    })
    .from(comments)
    .where(eq(comments.id, input.parentCommentId))
    .limit(1);
  const parent = parentRows[0];
  if (!parent) return { error: 'parent_not_found', status: 404 };
  if (parent.entityKind !== input.entityKind || parent.entityId !== input.entityId) {
    return { error: 'parent_entity_mismatch', status: 400 };
  }

  const rootCommentId = parent.parentCommentId ?? parent.id;
  if (!parent.parentCommentId) {
    return { parent: { rootCommentId, autoContinueClaude: parent.autoContinueClaude } };
  }

  const rootRows = await db()
    .select({
      id: comments.id,
      entityKind: comments.entityKind,
      entityId: comments.entityId,
      autoContinueClaude: comments.autoContinueClaude,
    })
    .from(comments)
    .where(eq(comments.id, rootCommentId))
    .limit(1);
  const root = rootRows[0];
  if (!root || root.entityKind !== input.entityKind || root.entityId !== input.entityId) {
    return { error: 'parent_root_not_found', status: 400 };
  }
  return { parent: { rootCommentId: root.id, autoContinueClaude: root.autoContinueClaude } };
}

type CommentContextRow = {
  id: string;
  parentCommentId: string | null;
  authorKind: 'human' | 'claude' | 'system';
  body: string;
  createdAt: Date;
};

async function buildCommentContext(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId?: string;
}) {
  const selection = {
    id: comments.id,
    parentCommentId: comments.parentCommentId,
    authorKind: comments.authorKind,
    body: comments.body,
    createdAt: comments.createdAt,
  };

  if (input.rootCommentId) {
    const rows = await db()
      .select(selection)
      .from(comments)
      .where(or(eq(comments.id, input.rootCommentId), eq(comments.parentCommentId, input.rootCommentId)))
      .orderBy(asc(comments.createdAt));
    return formatCommentContext('Comment thread before the latest message', rows);
  }

  const rows = await db()
    .select(selection)
    .from(comments)
    .where(and(eq(comments.entityKind, input.entityKind), eq(comments.entityId, input.entityId)))
    .orderBy(desc(comments.createdAt))
    .limit(40);
  return formatCommentContext('Recent prior comments on this record before the latest message', [...rows].reverse());
}

function formatCommentContext(title: string, rows: CommentContextRow[]) {
  if (rows.length === 0) return '';
  return `${title}:\n${rows.map(formatCommentContextRow).join('\n')}`;
}

function formatCommentContextRow(row: CommentContextRow) {
  const author = row.authorKind === 'claude' ? 'Claude' : row.authorKind === 'system' ? 'System' : 'User';
  const position = row.parentCommentId ? 'reply' : 'root';
  return `- ${row.createdAt.toISOString()} [${author}, ${position}]\n  ${indentForPrompt(truncateForPrompt(row.body, 1500))}`;
}

function indentForPrompt(text: string) {
  return text.trim().replace(/\n/g, '\n  ');
}

function truncateForPrompt(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

async function subscribeMentionedUsers(input: {
  body: string;
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
}) {
  const userIds = await findMentionedUserIds(input.body);
  await Promise.all(
    userIds.map((userId) =>
      subscribeToCommentThread({
        userId,
        entityKind: input.entityKind,
        entityId: input.entityId,
        rootCommentId: input.rootCommentId,
        reason: 'mentioned',
      }),
    ),
  );
}

async function notifyCommentParticipants(input: {
  actorUserId: string;
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
  commentId: string;
  body: string;
  kind: 'comment';
}) {
  const participants = await collectEntityParticipantUserIds({
    entityKind: input.entityKind,
    entityId: input.entityId,
    rootCommentId: input.rootCommentId,
  });
  const mentionedUserIds = await findMentionedUserIds(input.body);
  if (mentionedUserIds.length > 0) {
    await notifyUsers({
      userIds: mentionedUserIds,
      actorUserId: input.actorUserId,
      kind: 'mention',
      title: 'You were mentioned in Sagan',
      body: input.body.slice(0, 500),
      entityKind: input.entityKind,
      entityId: input.entityId,
      commentId: input.commentId,
      emailTopic: 'mention',
    });
  }
  const commentRecipients = participants.filter((userId) => !mentionedUserIds.includes(userId));
  await notifyUsers({
    userIds: commentRecipients,
    actorUserId: input.actorUserId,
    kind: input.kind,
    title: 'New comment in Sagan',
    body: input.body.slice(0, 500),
    entityKind: input.entityKind,
    entityId: input.entityId,
    commentId: input.commentId,
    emailTopic: 'comment',
  });
}

function dispatchErrorMessage(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}

async function insertSystemReply(input: {
  entityKind: z.infer<typeof createSchema>['entityKind'];
  entityId: string;
  parentCommentId: string;
  body: string;
}) {
  try {
    await db().insert(comments).values({
      entityKind: input.entityKind,
      entityId: input.entityId,
      parentCommentId: input.parentCommentId,
      authorKind: 'system',
      kind: 'discussion',
      body: input.body,
    });
  } catch (err) {
    console.error('comment_dispatch_system_reply_failed', err);
  }
}
