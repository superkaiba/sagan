import { and, eq, inArray, or } from 'drizzle-orm';
import {
  commentSubscriptions,
  entityMemberships,
  notifications,
  notificationPreferences,
  projectNarratives,
  projects,
  users,
} from '@sagan/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';
import { sendEmail } from './email';
import { getFullDashboardEmails } from './full-dashboard-access';

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

export async function collectFullDashboardUserIds(): Promise<string[]> {
  const fullAccessEmails = getFullDashboardEmails();
  const conditions = [
    eq(users.role, 'owner' as const),
    fullAccessEmails.length ? inArray(users.email, fullAccessEmails) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  if (conditions.length === 0) return [];
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(conditions.length === 1 ? conditions[0]! : or(...conditions));
  return rows.map((row) => row.id);
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
  const recipientRows = await db()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(inArray(users.id, userIds));
  const recipientEmails = new Map(recipientRows.map((row) => [row.id, row.email]));

  const links = await resolveEntityLinks(input.entityKind, input.entityId);
  const now = new Date();
  const rows = await Promise.all(userIds.map(async (userId) => {
    const preference = prefs.get(userId);
    const emailAllowed =
      input.emailTopic === 'comment'
        ? (preference?.emailComments ?? true)
        : input.emailTopic === 'mention'
          ? (preference?.emailMentions ?? true)
          : input.emailTopic === 'claude'
            ? (preference?.emailClaudeReplies ?? true)
          : false;
    let emailStatus = emailAllowed ? 'pending' : input.emailTopic ? 'disabled' : 'not_requested';
    let emailedAt: Date | undefined;
    const recipientEmail = recipientEmails.get(userId);
    if (emailAllowed && recipientEmail) {
      const result = await sendEmail({
        to: recipientEmail,
        subject: input.title,
        text: formatNotificationEmail({
          title: input.title,
          body: input.body,
          links,
        }),
      });
      emailStatus = result.status;
      emailedAt = result.status === 'sent' ? now : undefined;
      if (result.status === 'failed') {
        console.error('[email-failed]', {
          userId,
          kind: input.kind,
          error: result.error,
        });
      }
    }
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
      emailStatus,
      emailedAt,
    };
  }));

  return db().insert(notifications).values(rows).returning({ id: notifications.id });
}

interface EntityLinks {
  publicUrl: string | null;
  ownerUrl: string | null;
  mentorUrl: string | null;
}

function formatNotificationEmail(input: {
  title: string;
  body?: string;
  links: EntityLinks;
}) {
  const lines = [input.title, ''];
  if (input.body) lines.push(input.body, '');
  // Public URL goes first — it's the only link a non-owner commenter can use.
  // Owners can click either it or the internal Dashboard view below.
  if (input.links.publicUrl) lines.push(`View: ${input.links.publicUrl}`);
  if (input.links.ownerUrl) lines.push(`Dashboard: ${input.links.ownerUrl}`);
  if (input.links.mentorUrl && input.links.mentorUrl !== input.links.ownerUrl) {
    lines.push(`Mentor view: ${input.links.mentorUrl}`);
  }
  return lines.join('\n').trim();
}

async function resolveEntityLinks(
  entityKind?: EntityKind,
  entityId?: string,
): Promise<EntityLinks> {
  if (!entityKind || !entityId) return { publicUrl: null, ownerUrl: null, mentorUrl: null };
  const base = (process.env.NEXT_PUBLIC_SITE_URL || 'https://sagan.superkaiba.com').replace(/\/+$/, '');

  // Comments on a published narrative of a public project: surface the
  // public /p/<slug> URL alongside the internal entity page so public
  // commenters can click straight back to the thread.
  let publicUrl: string | null = null;
  if (entityKind === 'project_narrative') {
    const rows = await db()
      .select({ slug: projects.slug, isPublic: projects.public })
      .from(projectNarratives)
      .innerJoin(projects, eq(projects.id, projectNarratives.projectId))
      .where(eq(projectNarratives.id, entityId))
      .limit(1);
    const row = rows[0];
    if (row?.isPublic) publicUrl = `${base}/p/${row.slug}`;
  }

  const ownerUrl =
    entityKind === 'clean_result'
      ? `${base}/clean-results/${entityId}`
      : `${base}/e/${entityKind}/${entityId}`;
  const mentorUrl =
    entityKind === 'clean_result' ? `${base}/mentor/updates?result=${encodeURIComponent(entityId)}` : null;
  return { publicUrl, ownerUrl, mentorUrl };
}
