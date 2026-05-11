import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hashPassword } from '@sagan/auth';
import { setSessionCookie } from '@/lib/auth';
import { acceptInvite, loadPendingInviteByToken } from '@/lib/invites';

const acceptSchema = z.object({
  token: z.string().min(16).max(256),
  password: z.string().min(8).max(256),
  displayName: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const invite = await loadPendingInviteByToken(parsed.data.token);
  if (!invite) return NextResponse.json({ error: 'invalid_or_expired_invite' }, { status: 404 });

  const passwordHash = await hashPassword(parsed.data.password);
  const { user, membership } = await acceptInvite({
    invite,
    displayName: parsed.data.displayName,
    passwordHash,
    rotatePassword: true,
  });

  await setSessionCookie(user.id);
  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
    membership,
  });
}
