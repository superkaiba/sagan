import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@sagan/auth';
import { notificationPreferences, users, type User } from '@sagan/db/schema';
import { db } from './db';

export async function createPublicMentorAccount(input: {
  email: string;
  displayName?: string;
  password?: string;
}): Promise<{ user: User; created: boolean }> {
  const email = input.email.trim().toLowerCase();
  const existing = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) return { user: existing[0], created: false };

  const password = input.password ?? randomBytes(32).toString('base64url');
  const passwordHash = await hashPassword(password);
  const inserted = await db()
    .insert(users)
    .values({
      email,
      passwordHash,
      role: 'mentor',
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
