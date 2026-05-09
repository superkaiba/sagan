import { cookies } from 'next/headers';
import {
  createSession,
  invalidateSession,
  validateSession,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  type SessionContext,
} from '@eps/auth';
import { db } from './db';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
};

export async function getSession(): Promise<SessionContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return validateSession(db(), token);
}

export async function requireSession(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');
  return session;
}

export async function setSessionCookie(userId: string): Promise<void> {
  const { id, expiresAt } = await createSession(db(), userId);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, id, { ...COOKIE_OPTIONS, expires: expiresAt });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await invalidateSession(db(), token);
  store.delete(SESSION_COOKIE_NAME);
}
