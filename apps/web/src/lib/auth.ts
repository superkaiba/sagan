import { cookies, headers } from 'next/headers';
import type { NextResponse } from 'next/server';
import {
  createSession,
  invalidateSession,
  validateSession,
  validateApiToken,
  looksLikeApiToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
  type SessionContext,
} from '@sagan/auth';
import { db } from './db';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
};

export async function getSession(): Promise<SessionContext | null> {
  // Web cookie path.
  const store = await cookies();
  const cookieToken = store.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    const ctx = await validateSession(db(), cookieToken);
    if (ctx) return ctx;
  }
  // Mobile Bearer token path.
  const hdrs = await headers();
  const auth = hdrs.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice('Bearer '.length).trim();
    if (bearer) {
      // Long-lived API tokens use an `sk_` prefix; everything else is treated
      // as a session token (issued by /api/auth/login with x-client-mode: bearer).
      if (looksLikeApiToken(bearer)) {
        const apiCtx = await validateApiToken(db(), bearer);
        if (apiCtx) {
          return {
            session: {
              id: apiCtx.token.id,
              userId: apiCtx.token.userId,
              expiresAt: apiCtx.token.expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              createdAt: new Date(0),
            },
            user: apiCtx.user,
          };
        }
        return null;
      }
      return validateSession(db(), bearer);
    }
  }
  return null;
}

/** Mint a fresh session token (used by mobile login). */
export async function createSessionToken(userId: string): Promise<{ id: string; expiresAt: Date }> {
  return createSession(db(), userId);
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

export async function setSessionCookieOnResponse(res: NextResponse, userId: string): Promise<void> {
  const { id, expiresAt } = await createSession(db(), userId);
  res.cookies.set(SESSION_COOKIE_NAME, id, { ...COOKIE_OPTIONS, expires: expiresAt });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (token) await invalidateSession(db(), token);
  store.delete(SESSION_COOKIE_NAME);
}
