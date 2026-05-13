import { NextResponse } from 'next/server';
import { and, asc, desc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, chatSessions, comments, users } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isEntityKind } from '@/lib/entity';
import type { EntityKind } from '@/lib/entity';
import { ForbiddenError, requireEntityComment, requireEntityRead } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { getMentorCleanResultById } from '@/lib/mentor-results-data';
import {
  collectEntityParticipantUserIds,
  collectFullDashboardUserIds,
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
    .select({
      id: comments.id,
      entityKind: comments.entityKind,
      entityId: comments.entityId,
      parentCommentId: comments.parentCommentId,
      authorUserId: comments.authorUserId,
      authorKind: comments.authorKind,
      kind: comments.kind,
      body: comments.body,
      anchorNodeId: comments.anchorNodeId,
      anchoredQuote: comments.anchoredQuote,
      mentions: comments.mentions,
      autoContinueClaude: comments.autoContinueClaude,
      agentRunId: comments.agentRunId,
      resolvedAt: comments.resolvedAt,
      resolvedBy: comments.resolvedBy,
      resolvedSummaryMd: comments.resolvedSummaryMd,
      createdAt: comments.createdAt,
      updatedAt: comments.updatedAt,
      authorEmail: users.email,
      authorDisplayName: users.displayName,
      agentRunStatus: agentRuns.status,
      agentRunKind: agentRuns.kind,
      agentRunRequest: agentRuns.request,
    })
    .from(comments)
    .leftJoin(users, eq(comments.authorUserId, users.id))
    .leftJoin(agentRuns, eq(comments.agentRunId, agentRuns.id))
    .where(and(eq(comments.entityKind, entityKind), eq(comments.entityId, entityId)))
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows, viewerUserId: session.user.id });
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
    'agent_run',
    'chat_session',
    'html_artifact',
    'figure',
  ]),
  entityId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
  askAgent: z.enum(['Claude', 'Codex']).optional(),
  // Explicit kind for non-discussion comments. Owners use this to file
  // proposed follow-ups on an experiment in `reviewing` status — those land
  // as kind='todo' rows that the review panel renders with Q/T checkboxes.
  // When omitted, kind is derived from body (`@claude`/`@codex` → ask_claude,
  // otherwise discussion).
  kind: z.enum(['todo']).optional(),
  parentCommentId: z.string().uuid().optional(),
  // Google-Docs-style anchor: the selected text snippet the comment targets.
  // Only set on root comments; replies inherit the root's anchor visually.
  anchoredQuote: z.string().min(1).max(600).optional(),
});

const ASK_CLAUDE_RE = /(^|\s)@claude\b/i;
const ASK_CODEX_RE = /(^|\s)@codex\b/i;
const CODEX_REPLY_MARKER = '<!-- agent:codex -->';

type CommentAgentName = 'Claude' | 'Codex';

function agentMention(agent: CommentAgentName) {
  return `agent:${agent}`;
}

function mentionsForAgent(agent: CommentAgentName | null) {
  return agent ? [agentMention(agent)] : undefined;
}

function agentFromMentions(mentions: string[] | null | undefined): CommentAgentName | null {
  if (!mentions) return null;
  if (mentions.some((mention) => mention.toLowerCase() === 'agent:codex')) return 'Codex';
  if (mentions.some((mention) => mention.toLowerCase() === 'agent:claude')) return 'Claude';
  return null;
}

function requestedCommentAgent(body: string): CommentAgentName | null {
  if (ASK_CODEX_RE.test(body)) return 'Codex';
  if (ASK_CLAUDE_RE.test(body)) return 'Claude';
  return null;
}

function commentAgentIdentity(row: { authorKind?: string | null; mentions?: string[] | null; body: string }) {
  if (row.authorKind === 'codex') return 'Codex';
  return agentFromMentions(row.mentions) ?? requestedCommentAgent(row.body);
}

function stripLeadingAgentMention(body: string) {
  const stripped = body.replace(/^\s*(?:hey\s+)?@(claude|codex)\b[:,]?\s*/i, '').trim();
  return stripped || body.trim();
}

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

  const requestedAgent = parsed.data.askAgent ?? requestedCommentAgent(parsed.data.body);

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
  const autoContinueClaude = Boolean(parentInfo?.autoContinueClaude || requestedAgent);
  const dispatchAgent: CommentAgentName | null =
    requestedAgent ?? (autoContinueClaude ? (parentInfo?.autoContinueAgent ?? 'Claude') : null);
  const shouldDispatch = Boolean(dispatchAgent);
  const newCommentAnchoredQuote = normalizedParentCommentId
    ? (parentInfo?.rootAnchoredQuote ?? null)
    : (parsed.data.anchoredQuote?.trim() || null);
  const commentContext = shouldDispatch
    ? await buildCommentContext({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        rootCommentId: parentInfo?.rootCommentId,
      })
    : '';

  // Create the human comment first. Anchor only attaches to a root comment
  // (replies share the root's anchor through the thread, not a fresh one).
  const inserted = await db()
    .insert(comments)
    .values({
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
      parentCommentId: normalizedParentCommentId,
      authorUserId: session.user.id,
      authorKind: 'human',
      kind: parsed.data.kind ?? (requestedAgent ? 'ask_claude' : 'discussion'),
      body: parsed.data.body,
      mentions: mentionsForAgent(requestedAgent),
      anchoredQuote:
        normalizedParentCommentId ? null : parsed.data.anchoredQuote?.trim() || null,
      autoContinueClaude,
    })
    .returning();
  const comment = inserted[0]!;
  const rootCommentId = normalizedParentCommentId ?? comment.id;
  if (requestedAgent && normalizedParentCommentId) {
    await db()
      .update(comments)
      .set({ autoContinueClaude: true, mentions: mentionsForAgent(requestedAgent), updatedAt: new Date() })
      .where(eq(comments.id, normalizedParentCommentId));
  }
  await subscribeToCommentThread({
    userId: session.user.id,
    entityKind: parsed.data.entityKind,
    entityId: parsed.data.entityId,
    rootCommentId,
    reason: requestedAgent ? 'asked_agent' : 'commented',
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
      const agentName = dispatchAgent ?? 'Claude';
      const chatSessionId = await loadOrCreateCommentChatSession({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        rootCommentId,
        userId: session.user.id,
      });
      const runRequest = [
        `Comment responder: ${agentName}`,
        `Entity: ${parsed.data.entityKind} ${parsed.data.entityId}`,
        `Task: Respond to the latest comment in this Sagan thread. You are Claude Code with the full toolset (Read, Edit, Write, Bash, Agent, etc.) and permissions are bypassed. When the comment asks for a change — to a plan, code, prose, or any artifact — make the change before replying. When it only asks a question, just answer. Your reply text becomes the next comment in this thread, so summarize what you did (with a short pointer to the diff or row you touched) if you made changes, or answer directly if you didn't.`,
        `Working directory is the Sagan repo. For Sagan workflow state — experiments.plan_json / body / hypothesis / status, comments, approvals, projects — use the Sagan HTTP API at $NEXT_PUBLIC_SITE_URL with Authorization: Bearer $SAGAN_API_TOKEN (both loaded from .env). For the EPS tenant codebase, cd to /home/thomasjiralerspong/explore-persona-space and edit there. Do not write directly to the database; always go through the API.`,
        `The user asked for an agent answer from the comment UI. Answer the comment content itself.`,
        commentContext,
        formatLatestHumanComment(parsed.data.body, newCommentAnchoredQuote),
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
        title: `${agentName} started answering`,
        body: parsed.data.body.slice(0, 500),
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        commentId: comment.id,
        agentRunId: runId,
      });
      await appendDailyLogTrailBestEffort({
        action: `Asked ${agentName} from a comment thread (${runId.slice(0, 8)})`,
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
      const agentName = dispatchAgent ?? 'Claude';
      await insertSystemReply({
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        parentCommentId: rootCommentId,
        body: `${agentName} dispatch failed after saving the comment: ${message}`,
      });
      await appendDailyLogTrailBestEffort({
        action: `${agentName} comment dispatch failed`,
        why: `The user asked ${agentName} for help, but the app could not queue the agent run after saving the comment.`,
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
  rootAnchoredQuote: string | null;
  autoContinueClaude: boolean;
  autoContinueAgent: CommentAgentName;
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
      mentions: comments.mentions,
      body: comments.body,
      anchoredQuote: comments.anchoredQuote,
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
    return {
      parent: {
        rootCommentId,
        rootAnchoredQuote: parent.anchoredQuote?.trim() || null,
        autoContinueClaude: parent.autoContinueClaude,
        autoContinueAgent: commentAgentIdentity(parent) ?? 'Claude',
      },
    };
  }

  const rootRows = await db()
    .select({
      id: comments.id,
      entityKind: comments.entityKind,
      entityId: comments.entityId,
      autoContinueClaude: comments.autoContinueClaude,
      mentions: comments.mentions,
      body: comments.body,
      anchoredQuote: comments.anchoredQuote,
    })
    .from(comments)
    .where(eq(comments.id, rootCommentId))
    .limit(1);
  const root = rootRows[0];
  if (!root || root.entityKind !== input.entityKind || root.entityId !== input.entityId) {
    return { error: 'parent_root_not_found', status: 400 };
  }
  return {
    parent: {
      rootCommentId: root.id,
      rootAnchoredQuote: root.anchoredQuote?.trim() || null,
      autoContinueClaude: root.autoContinueClaude,
      autoContinueAgent: commentAgentIdentity(parent) ?? commentAgentIdentity(root) ?? 'Claude',
    },
  };
}

type CommentContextRow = {
  id: string;
  parentCommentId: string | null;
  authorKind: 'human' | 'claude' | 'codex' | 'system';
  body: string;
  anchoredQuote: string | null;
  createdAt: Date;
};

async function buildCommentContext(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId?: string;
}) {
  const entityContext = mentorSnapshotContext(input);
  const selection = {
    id: comments.id,
    parentCommentId: comments.parentCommentId,
    authorKind: comments.authorKind,
    body: comments.body,
    anchoredQuote: comments.anchoredQuote,
    createdAt: comments.createdAt,
  };

  if (input.rootCommentId) {
    const rows = await db()
      .select(selection)
      .from(comments)
      .where(or(eq(comments.id, input.rootCommentId), eq(comments.parentCommentId, input.rootCommentId)))
      .orderBy(asc(comments.createdAt));
    return joinPromptSections(
      entityContext,
      formatCommentContext('Comment thread before the latest message', rows),
    );
  }

  const rows = await db()
    .select(selection)
    .from(comments)
    .where(and(eq(comments.entityKind, input.entityKind), eq(comments.entityId, input.entityId)))
    .orderBy(desc(comments.createdAt))
    .limit(40);
  return joinPromptSections(
    entityContext,
    formatCommentContext('Recent prior comments on this record before the latest message', [...rows].reverse()),
  );
}

function mentorSnapshotContext(input: { entityKind: EntityKind; entityId: string }) {
  if (input.entityKind !== 'clean_result') return '';
  const result = getMentorCleanResultById(input.entityId);
  if (!result) return '';
  const sourceLine =
    result.number && result.url
      ? `- Source record: #${result.number} (${result.url})`
      : result.sourceLabel
        ? `- Source: ${result.sourceLabel}`
        : null;
  return [
    'Record context:',
    `- Title: ${result.title}`,
    sourceLine,
    `- Status: ${result.statusName}`,
    result.confidence ? `- Confidence: ${result.confidence}` : null,
    '',
    'Record body:',
    indentForPrompt(truncateForPrompt(result.body, 12_000)),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function joinPromptSections(...sections: string[]) {
  return sections.filter(Boolean).join('\n\n');
}

function formatCommentContext(title: string, rows: CommentContextRow[]) {
  if (rows.length === 0) return '';
  return `${title}:\n${rows.map(formatCommentContextRow).join('\n')}`;
}

function formatCommentContextRow(row: CommentContextRow) {
  const body = stripCodexReplyMarker(row.body);
  const author =
    row.authorKind === 'codex' || row.body.startsWith(CODEX_REPLY_MARKER)
      ? 'Codex'
      : row.authorKind === 'claude'
        ? 'Claude'
      : row.authorKind === 'system'
        ? 'System'
        : 'User';
  const position = row.parentCommentId ? 'reply' : 'root';
  const anchorLine =
    !row.parentCommentId && row.anchoredQuote?.trim()
      ? `\n  anchored to: "${truncateForPrompt(row.anchoredQuote.trim(), 400)}"`
      : '';
  return `- ${row.createdAt.toISOString()} [${author}, ${position}]${anchorLine}\n  ${indentForPrompt(truncateForPrompt(body, 1500))}`;
}

function formatLatestHumanComment(body: string, anchoredQuote: string | null) {
  const stripped = stripLeadingAgentMention(body);
  const header = anchoredQuote
    ? `Latest human comment (anchored to selected text: "${truncateForPrompt(anchoredQuote, 400)}"):`
    : 'Latest human comment:';
  return `${header}\n\n${stripped}`;
}

function stripCodexReplyMarker(body: string) {
  return body.startsWith(CODEX_REPLY_MARKER) ? body.slice(CODEX_REPLY_MARKER.length).trimStart() : body;
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
  const fullDashboardUserIds = await collectFullDashboardUserIds();
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
  const commentRecipients = [...new Set([...participants, ...fullDashboardUserIds])].filter(
    (userId) => !mentionedUserIds.includes(userId),
  );
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
