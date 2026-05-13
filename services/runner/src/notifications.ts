import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db.js';
import { sendEmail } from './email.js';

const { projectNarratives, projects } = schema;

type CommentRow = typeof schema.comments.$inferSelect;
type EntityKind = CommentRow['entityKind'];

export async function notifyClaudeFinished(input: {
  entityKind: EntityKind;
  entityId: string;
  rootCommentId: string;
  commentId: string;
  agentRunId: string;
  agentName?: 'Claude' | 'Codex';
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
  const recipientRows = await db()
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));
  const recipientEmails = new Map(recipientRows.map((row) => [row.id, row.email]));
  const links = await resolveEntityLinks(input.entityKind, input.entityId);
  const now = new Date();
  const rows = await Promise.all(userIds.map(async (userId) => {
    const emailAllowed = prefs.get(userId)?.emailClaudeReplies ?? true;
    let emailStatus = emailAllowed ? 'pending' : 'disabled';
    let emailedAt: Date | undefined;
    const recipientEmail = recipientEmails.get(userId);
    if (emailAllowed && recipientEmail) {
      const result = await sendEmail({
        to: recipientEmail,
        subject: `${input.agentName ?? 'Claude'} answered a comment`,
        text: formatNotificationEmail({
          title: `${input.agentName ?? 'Claude'} answered a comment`,
          body: truncate(input.body, 500),
          links,
        }),
      });
      emailStatus = result.status;
      emailedAt = result.status === 'sent' ? now : undefined;
      if (result.status === 'failed') {
        console.error('[email-failed]', {
          userId,
          kind: 'claude_finished',
          error: result.error,
        });
      }
    }
    return {
      userId,
      kind: 'claude_finished' as const,
      title: `${input.agentName ?? 'Claude'} answered a comment`,
      body: truncate(input.body, 500),
      entityKind: input.entityKind,
      entityId: input.entityId,
      commentId: input.commentId,
      agentRunId: input.agentRunId,
      emailStatus,
      emailedAt,
    };
  }));

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
