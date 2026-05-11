import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db.js';

type CommentRow = typeof schema.comments.$inferSelect;
type EntityKind = CommentRow['entityKind'];

export async function notifyClaudeFinished(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
  commentId: string;
  agentRunId: string;
  body: string;
  fallbackUserId?: string | null;
}) {
  const participantIds = await collectParticipantUserIds({
    entityKind: input.entityKind,
    entityId: input.entityId,
    rootCommentId: input.rootCommentId,
  });
  const userIds = [...new Set([input.fallbackUserId, ...participantIds].filter(isString))];
  if (userIds.length === 0) return;

  const preferenceRows = await db()
    .select()
    .from(schema.notificationPreferences)
    .where(inArray(schema.notificationPreferences.userId, userIds));
  const prefs = new Map(preferenceRows.map((row) => [row.userId, row]));
  const now = new Date();
  const rows = userIds.map((userId) => {
    const emailAllowed = prefs.get(userId)?.emailClaudeReplies ?? true;
    return {
      userId,
      kind: 'claude_finished' as const,
      title: 'Claude answered a comment',
      body: truncate(input.body, 500),
      entityKind: input.entityKind,
      entityId: input.entityId,
      commentId: input.commentId,
      agentRunId: input.agentRunId,
      emailStatus: emailAllowed ? 'logged' : 'disabled',
      emailedAt: emailAllowed ? now : undefined,
    };
  });

  const existingRows = await db()
    .select({ userId: schema.notifications.userId })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.kind, 'claude_finished'),
        eq(schema.notifications.agentRunId, input.agentRunId),
        inArray(schema.notifications.userId, userIds),
      ),
    );
  const alreadyNotified = new Set(existingRows.map((row) => row.userId));
  const newRows = rows.filter((row) => !alreadyNotified.has(row.userId));
  if (newRows.length === 0) return;

  for (const row of newRows) {
    if (row.emailStatus === 'logged') {
      console.info('[dev-email]', {
        userId: row.userId,
        kind: row.kind,
        title: row.title,
        entityKind: row.entityKind,
        entityId: row.entityId,
      });
    }
  }
  await db().insert(schema.notifications).values(newRows);
}

async function collectParticipantUserIds(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
}) {
  const memberRows = await db()
    .select({ userId: schema.entityMemberships.userId })
    .from(schema.entityMemberships)
    .where(
      and(
        eq(schema.entityMemberships.entityKind, input.entityKind),
        eq(schema.entityMemberships.entityId, input.entityId),
      ),
    );
  const subscriptionRows = await db()
    .select({ userId: schema.commentSubscriptions.userId })
    .from(schema.commentSubscriptions)
    .where(
      and(
        eq(schema.commentSubscriptions.entityKind, input.entityKind),
        eq(schema.commentSubscriptions.entityId, input.entityId),
        eq(schema.commentSubscriptions.rootCommentId, input.rootCommentId),
      ),
    );
  return [...memberRows, ...subscriptionRows].map((row) => row.userId);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string';
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}
