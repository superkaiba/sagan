import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSessionCookie } from '@/lib/auth';
import { createPublicMentorAccount } from '@/lib/public-signup';

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const { user, created } = await createPublicMentorAccount({
    email: parsed.data.email,
    password: parsed.data.password,
    displayName: parsed.data.displayName,
  });
  if (!created) {
    return NextResponse.json({ error: 'account_exists' }, { status: 409 });
  }

  await setSessionCookie(user.id);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
  });
}
