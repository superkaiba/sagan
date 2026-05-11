import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { users } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { setSessionCookieOnResponse } from '@/lib/auth';
import { acceptInvite, loadPendingInviteByToken, loadPendingInvitesByEmail } from '@/lib/invites';
import { getRequestOrigin } from '@/lib/request-origin';
import { createPublicMentorAccount } from '@/lib/public-signup';

const STATE_COOKIE = 'sagan_google_oauth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

interface OAuthState {
  state: string;
  next?: string;
  inviteToken?: string;
  signup?: boolean;
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

function redirectWithError(req: Request, error: string, inviteToken?: string, signup?: boolean) {
  const origin = getRequestOrigin(req);
  const target = inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : signup ? '/signup' : '/login';
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
    return redirectWithError(req, 'google_state_invalid', stateCookie?.inviteToken, stateCookie?.signup);
  }

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
  if (!tokenRes.ok) return redirectWithError(req, 'google_token_failed', stateCookie.inviteToken, stateCookie.signup);
  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) return redirectWithError(req, 'google_token_failed', stateCookie.inviteToken, stateCookie.signup);

  const infoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenData.access_token}` },
  });
  if (!infoRes.ok) return redirectWithError(req, 'google_profile_failed', stateCookie.inviteToken, stateCookie.signup);
  const profile = (await infoRes.json()) as GoogleUserInfo;
  const email = profile.email?.toLowerCase();
  const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
  if (!email || !emailVerified) {
    return redirectWithError(req, 'google_email_unverified', stateCookie.inviteToken, stateCookie.signup);
  }

  let redirectTo = safeRelativePath(stateCookie.next);
  let user = (await db().select().from(users).where(eq(users.email, email)).limit(1))[0];

  if (stateCookie.inviteToken) {
    const invite = await loadPendingInviteByToken(stateCookie.inviteToken);
    if (!invite) return redirectWithError(req, 'invite_expired', stateCookie.inviteToken, stateCookie.signup);
    if (invite.email !== email) {
      return redirectWithError(req, 'google_email_mismatch', stateCookie.inviteToken, stateCookie.signup);
    }
    const accepted = await acceptInvite({ invite, displayName: profile.name });
    user = accepted.user;
    redirectTo = `/e/${accepted.membership.entityKind}/${accepted.membership.entityId}`;
  } else {
    const invites = await loadPendingInvitesByEmail(email);
    if (!user && invites.length === 0 && stateCookie.signup) {
      const created = await createPublicMentorAccount({ email, displayName: profile.name });
      user = created.user;
      redirectTo = safeRelativePath(stateCookie.next || '/mentor/updates');
    }
    if (!user && invites.length === 0) return redirectWithError(req, 'google_no_account');
    for (const invite of invites) {
      const accepted = await acceptInvite({ invite, displayName: profile.name });
      user = accepted.user;
      redirectTo = `/e/${accepted.membership.entityKind}/${accepted.membership.entityId}`;
    }
  }

  if (!user) return redirectWithError(req, 'google_no_account');

  const res = NextResponse.redirect(new URL(redirectTo, origin));
  await setSessionCookieOnResponse(res, user.id);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
