import { and, eq, isNull } from 'drizzle-orm';
import {
  cleanResults,
  dailyLogEntries,
  entityMemberships,
  projectNarratives,
  projects,
} from '@sagan/db/schema';
import type { SessionContext } from '@sagan/auth';
import { requireSession } from './auth';
import { db } from './db';
import type { EntityKind } from './entity';
import { hasFullDashboardAccess } from './full-dashboard-access';
import { isMentorCleanResultId } from './mentor-results-data';

export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export function isOwner(session: SessionContext): boolean {
  return hasFullDashboardAccess(session);
}

export async function requireOwner(): Promise<SessionContext> {
  const session = await requireSession();
  if (!isOwner(session)) throw new ForbiddenError('owner_required');
  return session;
}

export async function getEntityMembershipRole(
  userId: string,
  entityKind: EntityKind,
  entityId: string,
) {
  const rows = await db()
    .select({ role: entityMemberships.role })
    .from(entityMemberships)
    .where(
      and(
        eq(entityMemberships.userId, userId),
        eq(entityMemberships.entityKind, entityKind),
        eq(entityMemberships.entityId, entityId),
      ),
    )
    .limit(1);
  return rows[0]?.role ?? null;
}

export async function canReadEntity(
  session: SessionContext,
  entityKind: EntityKind,
  entityId: string,
): Promise<boolean> {
  if (isOwner(session)) return true;
  if (await getEntityMembershipRole(session.user.id, entityKind, entityId)) return true;
  return canReadSharedEntity(entityKind, entityId);
}

export async function canCommentOnEntity(
  session: SessionContext,
  entityKind: EntityKind,
  entityId: string,
): Promise<boolean> {
  if (isOwner(session)) return true;
  const role = await getEntityMembershipRole(session.user.id, entityKind, entityId);
  return role === 'owner' || role === 'collaborator' || role === 'mentor' || (await canReadSharedEntity(entityKind, entityId));
}

async function canReadSharedEntity(entityKind: EntityKind, entityId: string): Promise<boolean> {
  if (entityKind === 'daily_log_entry') {
    const rows = await db()
      .select({ id: dailyLogEntries.id })
      .from(dailyLogEntries)
      .where(
        and(
          eq(dailyLogEntries.id, entityId),
          eq(dailyLogEntries.kind, 'clean_result'),
          isNull(dailyLogEntries.archivedAt),
        ),
      )
      .limit(1);
    return Boolean(rows[0]);
  }

  // A published narrative of a public project is readable by any authenticated
  // user (matches the visibility of /p/<slug>, which doesn't require auth).
  // Combined with the comment fallback in canCommentOnEntity, this also lets
  // any signed-in viewer post comments — the Google-Docs "anyone with the link
  // can comment" model for the public dashboard view.
  if (entityKind === 'project_narrative') {
    const rows = await db()
      .select({ status: projectNarratives.status, isPublic: projects.public })
      .from(projectNarratives)
      .innerJoin(projects, eq(projects.id, projectNarratives.projectId))
      .where(eq(projectNarratives.id, entityId))
      .limit(1);
    const row = rows[0];
    return Boolean(row && row.status === 'published' && row.isPublic === true);
  }

  if (entityKind !== 'clean_result') return false;
  if (isMentorCleanResultId(entityId)) return true;
  const rows = await db()
    .select({ status: cleanResults.status })
    .from(cleanResults)
    .where(eq(cleanResults.id, entityId))
    .limit(1);
  return rows[0]?.status === 'shared';
}

export async function requireEntityRead(
  session: SessionContext,
  entityKind: EntityKind,
  entityId: string,
): Promise<void> {
  if (!(await canReadEntity(session, entityKind, entityId))) {
    throw new ForbiddenError('entity_access_required');
  }
}

export async function requireEntityComment(
  session: SessionContext,
  entityKind: EntityKind,
  entityId: string,
): Promise<void> {
  if (!(await canCommentOnEntity(session, entityKind, entityId))) {
    throw new ForbiddenError('comment_access_required');
  }
}
