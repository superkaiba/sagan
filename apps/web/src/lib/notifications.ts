import { and, eq, inArray } from 'drizzle-orm';
import {
  commentSubscriptions,
  entityMemberships,
  notifications,
  notificationPreferences,
  users,
} from '@sagan/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';

type NotificationInsert = typeof notifications.$inferInsert;
type NotificationKind = NotificationInsert['kind'];
type NotificationEmailTopic = 'comment' | 'mention' | 'claude';

const MENTION_EMAIL_RE = /@([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;

export function extractMentionEmails(body: string): string[] {
  return [...body.matchAll(MENTION_EMAIL_RE)].map((match) => match[1]!.toLowerCase());
}

export async function findMentionedUserIds(body: string): Promise<string[]> {
  const emails = [...new Set(extractMentionEmails(body))];
  if (emails.length === 0) return [];
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  return rows.map((row) => row.id);
}

export async function subscribeToCommentThread(input: {
  userId: string;
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
  reason: string;
}) {
  await db()
    .insert(commentSubscriptions)
    .values(input)
    .onConflictDoUpdate({
      target: [
        commentSubscriptions.userId,
        commentSubscriptions.entityKind,
        commentSubscriptions.entityId,
        commentSubscriptions.rootCommentId,
      ],
      set: { reason: input.reason, updatedAt: new Date() },
    });
}

export async function collectEntityParticipantUserIds(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId?: string;
}): Promise<string[]> {
  const memberRows = await db()
    .select({ userId: entityMemberships.userId })
    .from(entityMemberships)
    .where(
      and(
        eq(entityMemberships.entityKind, input.entityKind),
        eq(entityMemberships.entityId, input.entityId),
      ),
    );

  const subscriptionRows = input.rootCommentId
    ? await db()
        .select({ userId: commentSubscriptions.userId })
        .from(commentSubscriptions)
        .where(
          and(
            eq(commentSubscriptions.entityKind, input.entityKind),
            eq(commentSubscriptions.entityId, input.entityId),
            eq(commentSubscriptions.rootCommentId, input.rootCommentId),
          ),
        )
    : [];

  return [...new Set([...memberRows, ...subscriptionRows].map((row) => row.userId))];
}

export async function notifyUsers(input: {
  userIds: string[];
  actorUserId?: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  entityKind?: EntityKind;
  entityId?: string;
  commentId?: string;
  agentRunId?: string;
  emailTopic?: NotificationEmailTopic;
}) {
  const userIds = [...new Set(input.userIds)].filter((id) => id !== input.actorUserId);
  if (userIds.length === 0) return [];

  const preferenceRows = await db()
    .select()
    .from(notificationPreferences)
    .where(inArray(notificationPreferences.userId, userIds));
  const prefs = new Map(preferenceRows.map((row) => [row.userId, row]));

  const now = new Date();
  const rows = userIds.map((userId) => {
    const preference = prefs.get(userId);
    const emailAllowed =
      input.emailTopic === 'comment'
        ? (preference?.emailComments ?? true)
        : input.emailTopic === 'mention'
          ? (preference?.emailMentions ?? true)
          : input.emailTopic === 'claude'
            ? (preference?.emailClaudeReplies ?? true)
            : false;
    return {
      userId,
      actorUserId: input.actorUserId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      entityKind: input.entityKind,
      entityId: input.entityId,
      commentId: input.commentId,
      agentRunId: input.agentRunId,
      emailStatus: emailAllowed ? 'logged' : input.emailTopic ? 'disabled' : 'not_requested',
      emailedAt: emailAllowed ? now : undefined,
    };
  });

  for (const row of rows) {
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

  return db().insert(notifications).values(rows).returning({ id: notifications.id });
}
