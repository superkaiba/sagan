import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import {
  accessInvites,
  entityMemberships,
  notificationPreferences,
  users,
  type AccessInvite,
  type User,
} from '@sagan/db/schema';
import { hashPassword } from '@sagan/auth';
import { db } from './db';

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function loadPendingInviteByToken(token: string): Promise<AccessInvite | null> {
  const tokenHash = hashInviteToken(token);
  const rows = await db()
    .select()
    .from(accessInvites)
    .where(
      and(
        eq(accessInvites.tokenHash, tokenHash),
        eq(accessInvites.status, 'pending'),
        gt(accessInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function loadPendingInvitesByEmail(email: string): Promise<AccessInvite[]> {
  return db()
    .select()
    .from(accessInvites)
    .where(
      and(
        eq(accessInvites.email, email.toLowerCase()),
        eq(accessInvites.status, 'pending'),
        gt(accessInvites.expiresAt, new Date()),
      ),
    )
    .limit(20);
}

export async function acceptInvite(input: {
  invite: AccessInvite;
  displayName?: string;
  passwordHash?: string;
  rotatePassword?: boolean;
}): Promise<{
  user: User;
  membership: { entityKind: AccessInvite['entityKind']; entityId: string; role: AccessInvite['role'] };
}> {
  const { invite } = input;
  const existing = await db().select().from(users).where(eq(users.email, invite.email)).limit(1);
  let user = existing[0];
  const passwordHash = input.passwordHash ?? (await hashPassword(randomBytes(32).toString('base64url')));
  const role = invite.role === 'mentor' ? 'mentor' : 'collaborator';

  if (!user) {
    const inserted = await db()
      .insert(users)
      .values({
        email: invite.email,
        passwordHash,
        role,
        displayName: input.displayName,
      })
      .returning();
    user = inserted[0]!;
  } else if (user.role !== 'owner') {
    const shouldUpdatePassword = input.rotatePassword || !user.passwordHash;
    const updated = await db()
      .update(users)
      .set({
        ...(shouldUpdatePassword ? { passwordHash } : {}),
        role,
        displayName: input.displayName ?? user.displayName,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();
    user = updated[0]!;
  }

  await db()
    .insert(notificationPreferences)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: notificationPreferences.userId });

  await db()
    .insert(entityMemberships)
    .values({
      userId: user.id,
      entityKind: invite.entityKind,
      entityId: invite.entityId,
      role: invite.role,
      createdBy: invite.createdBy,
    })
    .onConflictDoUpdate({
      target: [entityMemberships.userId, entityMemberships.entityKind, entityMemberships.entityId],
      set: { role: invite.role, updatedAt: new Date() },
    });

  await db()
    .update(accessInvites)
    .set({
      status: 'accepted',
      invitedUserId: user.id,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(accessInvites.id, invite.id));

  return {
    user,
    membership: {
      entityKind: invite.entityKind,
      entityId: invite.entityId,
      role: invite.role,
    },
  };
}
