import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getRequestOrigin } from '@/lib/request-origin';

const STATE_COOKIE = 'sagan_google_oauth';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

function safeRelativePath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/today';
  return value;
}

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const origin = getRequestOrigin(req);
  const url = new URL(req.url);
  const signup = url.searchParams.get('signup') === '1' || url.searchParams.get('mode') === 'signup';
  if (!clientId) {
    return NextResponse.redirect(new URL(`${signup ? '/signup' : '/login'}?error=google_not_configured`, origin));
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? new URL('/api/auth/google/callback', origin).toString();
  const state = randomBytes(24).toString('base64url');
  const statePayload = {
    state,
    next: safeRelativePath(url.searchParams.get('next')),
    inviteToken: url.searchParams.get('inviteToken') ?? undefined,
    signup,
  };

  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  const loginHint = url.searchParams.get('email');
  if (loginHint) authUrl.searchParams.set('login_hint', loginHint);
  if (url.searchParams.get('selectAccount') === '1') authUrl.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, Buffer.from(JSON.stringify(statePayload)).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  });
  return res;
}
