import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { users } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { createSessionToken, setSessionCookieOnResponse } from '@/lib/auth';
import { getRequestOrigin } from '@/lib/request-origin';
import { createPublicUserAccount } from '@/lib/public-signup';
import { hasFullDashboardAccessEmail } from '@/lib/full-dashboard-access';
import { appendQuery, isAllowedMobileRedirect } from '@/lib/mobile-redirect';

const STATE_COOKIE = 'sagan_google_oauth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface OAuthState {
  state: string;
  next?: string;
  signup?: boolean;
  mobileRedirect?: string;
}

interface GoogleUserInfo {
  email?: string;
  email_verified?: boolean | string;
  name?: string;
}

function parseStateCookie(value: string | undefined): OAuthState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as OAuthState;
    return typeof parsed.state === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function safeRelativePath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/today';
  return value;
}

function redirectWithError(
  req: Request,
  error: string,
  signup?: boolean,
  mobileRedirect?: string,
) {
  if (mobileRedirect && isAllowedMobileRedirect(mobileRedirect)) {
    const res = NextResponse.redirect(appendQuery(mobileRedirect, { error }));
    res.cookies.delete(STATE_COOKIE);
    return res;
  }
  const origin = getRequestOrigin(req);
  const target = signup ? '/signup' : '/login';
  const url = new URL(target, origin);
  url.searchParams.set('error', error);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return redirectWithError(req, 'google_not_configured');

  const url = new URL(req.url);
  const origin = getRequestOrigin(req);
  const cookieStore = await cookies();
  const stateCookie = parseStateCookie(url.searchParams.get('state') ? cookieStore.get(STATE_COOKIE)?.value : undefined);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !stateCookie || stateCookie.state !== state) {
    return redirectWithError(req, 'google_state_invalid', stateCookie?.signup, stateCookie?.mobileRedirect);
  }

  const mobileRedirect = stateCookie.mobileRedirect;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? new URL('/api/auth/google/callback', origin).toString();
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return redirectWithError(req, 'google_token_failed', stateCookie.signup, mobileRedirect);
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) return redirectWithError(req, 'google_token_failed', stateCookie.signup, mobileRedirect);

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!infoRes.ok) return redirectWithError(req, 'google_profile_failed', stateCookie.signup, mobileRedirect);
  const profile = (await infoRes.json()) as GoogleUserInfo;
  const email = profile.email?.toLowerCase();
  const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
  if (!email || !emailVerified) {
    return redirectWithError(req, 'google_email_unverified', stateCookie.signup, mobileRedirect);
  }

  let redirectTo = safeRelativePath(stateCookie.next);
  let user = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];
  let createdPublicAccount = false;

  if (!user) {
    const created = await createPublicUserAccount({ email, displayName: profile.name });
    user = created.user;
    createdPublicAccount = created.created;
  } else if (hasFullDashboardAccessEmail(email) && user.role !== 'owner') {
    const updated = await db()
      .update(users)
      .set({ role: 'owner', updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    user = updated[0] ?? user;
  }

  if (!user) return redirectWithError(req, 'google_no_account', stateCookie.signup, mobileRedirect);

  // Mobile flow: hand a session token back to the in-app browser via a
  // custom-scheme deep link. The mobile app intercepts the redirect,
  // stores the token in expo-secure-store, and replays it as a
  // Bearer token. No cookie is set on this response.
  if (mobileRedirect && isAllowedMobileRedirect(mobileRedirect)) {
    const { id } = await createSessionToken(user.id);
    const res = NextResponse.redirect(appendQuery(mobileRedirect, { token: id }));
    res.cookies.delete(STATE_COOKIE);
    return res;
  }

  if (createdPublicAccount || (user.role !== 'owner' && redirectTo === '/today')) {
    redirectTo = '/mentor/updates';
  }

  const res = NextResponse.redirect(new URL(redirectTo, origin));
  await setSessionCookieOnResponse(res, user.id);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
