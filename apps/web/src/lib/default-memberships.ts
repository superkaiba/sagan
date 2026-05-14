import { inArray } from 'drizzle-orm';
import { entityMemberships, users } from '@sagan/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';

function parseMentorEmails(): string[] {
  const raw = process.env.SAGAN_DEFAULT_MENTOR_EMAIL?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function lookupMentorUserIds(): Promise<string[]> {
  const emails = parseMentorEmails();
  if (emails.length === 0) return [];
  const rows = await db()
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.email, emails));
  return rows.map((row) => row.id);
}

export async function grantDefaultMentorMembership(
  entityKind: EntityKind,
  entityId: string,
  createdByUserId?: string,
): Promise<void> {
  const userIds = await lookupMentorUserIds();
  if (userIds.length === 0) return;
  await db()
    .insert(entityMemberships)
    .values(
      userIds.map((userId) => ({
        userId,
        entityKind,
        entityId,
        role: 'mentor' as const,
        createdBy: createdByUserId ?? null,
      })),
    )
    .onConflictDoNothing({
      target: [
        entityMemberships.userId,
        entityMemberships.entityKind,
        entityMemberships.entityId,
      ],
    });
}

export async function backfillDefaultMentorMembership(
  entityKind: EntityKind,
  entityIds: string[],
  createdByUserId?: string,
): Promise<number> {
  if (entityIds.length === 0) return 0;
  const userIds = await lookupMentorUserIds();
  if (userIds.length === 0) return 0;
  const rows = userIds.flatMap((userId) =>
    entityIds.map((entityId) => ({
      userId,
      entityKind,
      entityId,
      role: 'mentor' as const,
      createdBy: createdByUserId ?? null,
    })),
  );
  const inserted = await db()
    .insert(entityMemberships)
    .values(rows)
    .onConflictDoNothing({
      target: [
        entityMemberships.userId,
        entityMemberships.entityKind,
        entityMemberships.entityId,
      ],
    })
    .returning({ id: entityMemberships.id });
  return inserted.length;
}
