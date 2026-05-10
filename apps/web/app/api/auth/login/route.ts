import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '@eps/db/schema';
import { verifyPassword } from '@eps/auth';
import { db } from '@/lib/db';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const rows = await db().select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  // Constant-time-ish: verify even if user is null to avoid leaking existence.
  const dummyHash =
    '$argon2id$v=19$m=19456,t=2,p=1$bm9tYW1wbWFub25vbXN0YXJ0$YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE';
  const ok = await verifyPassword(user?.passwordHash ?? dummyHash, password);

  if (!ok || !user) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  // Mobile clients send `x-client-mode: bearer` to receive a token in the
  // JSON response (in addition to the cookie). They store the token in
  // expo-secure-store and replay it as Authorization: Bearer <token>.
  const wantsBearer = req.headers.get('x-client-mode')?.toLowerCase() === 'bearer';
  if (wantsBearer) {
    const { id } = await createSessionToken(user.id);
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      sessionToken: id,
    });
  }
  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true, user: { id: user.id, email: user.email } });
}
