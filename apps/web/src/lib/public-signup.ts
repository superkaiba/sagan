import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@sagan/auth';
import { notificationPreferences, users, type User } from '@sagan/db/schema';
import { db } from './db';
import { hasFullDashboardAccessEmail } from './full-dashboard-access';

export async function createPublicUserAccount(input: {
  email: string;
  displayName?: string;
  password?: string;
}): Promise<{ user: User; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const existing = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) {
    if (hasFullDashboardAccessEmail(email) && existing[0].role !== 'owner') {
      const updated = await db()
        .update(users)
        .set({ role: 'owner', updatedAt: new Date() })
        .where(eq(users.id, existing[0].id))
        .returning();
      return { user: updated[0]!, created: false };
    }
    return { user: existing[0], created: false };
  }

  const password = input.password ?? randomBytes(32).toString('base64url');
  const passwordHash = await hashPassword(password);
  const role = hasFullDashboardAccessEmail(email) ? 'owner' : 'collaborator';
  const inserted = await db()
    .insert(users)
    .values({
      email,
      passwordHash,
      role,
      displayName: input.displayName?.trim() || undefined,
    })
    .returning();
  const user = inserted[0]!;

  await db()
    .insert(notificationPreferences)
    .values({ userId: user.id })
    .onConflictDoNothing({ target: notificationPreferences.userId });

  return { user, created: true };
}
