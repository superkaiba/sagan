import { randomBytes, createHash } from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import { sessions, users, type Db, type Session, type User } from '@sagan/db';
import { SESSION_RENEW_THRESHOLD_MS, SESSION_TTL_MS } from './constants';

export interface SessionContext {
  session: Session;
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role'>;
}

function generateSessionId(): string {
  // 32 bytes of entropy, base64url encoded → 43 chars, URL-safe.
  return randomBytes(32).toString('base64url');
}

function hashSessionId(id: string): string {
  return createHash('sha256').update(id).digest('hex');
}

export async function createSession(db: Db, userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionId(id), userId, expiresAt });
  return { id, expiresAt };
}

export async function validateSession(
  db: Db,
  rawSessionId: string,
): Promise<SessionContext | null> {
  const hashedId = hashSessionId(rawSessionId);
  const rows = await db
    .select({
      session: sessions,
      user: { id: users.id, email: users.email, displayName: users.displayName, role: users.role },
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, hashedId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  const expires = row.session.expiresAt.getTime();

  if (now >= expires) {
    await db.delete(sessions).where(eq(sessions.id, hashedId));
    return null;
  }

  // Sliding expiration: renew after the session has gone untouched for the threshold.
  if (expires - now < SESSION_TTL_MS - SESSION_RENEW_THRESHOLD_MS) {
    const newExpiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt: newExpiresAt }).where(eq(sessions.id, hashedId));
    row.session.expiresAt = newExpiresAt;
  }

  return { session: row.session, user: row.user };
}

export async function invalidateSession(db: Db, rawSessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionId(rawSessionId)));
}

export async function invalidateUserSessions(db: Db, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(db: Db): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return result.length ?? 0;
}
