import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { invalidateSession } from '@sagan/auth';
import { clearSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST() {
  await clearSessionCookie();
  // Bearer-token clients (mobile) don't go through the cookie path, so the
  // server-side session row would otherwise linger for SESSION_TTL_DAYS.
  const hdrs = await headers();
  const auth = hdrs.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice('Bearer '.length).trim();
    if (bearer) await invalidateSession(db(), bearer).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
