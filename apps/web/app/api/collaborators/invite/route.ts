import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { accessInvites } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { isEntityKind, loadEntity } from '@/lib/entity';
import { hashInviteToken } from '@/lib/invites';
import { getRequestOrigin } from '@/lib/request-origin';

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['collaborator', 'mentor']),
  entityKind: z.string(),
  entityId: z.string().uuid(),
  expiresInDays: z.number().int().min(1).max(90).default(14),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  if (!isEntityKind(parsed.data.entityKind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const entity = await loadEntity(parsed.data.entityKind, parsed.data.entityId);
  if (!entity) return NextResponse.json({ error: 'entity_not_found' }, { status: 404 });

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashInviteToken(token);
  const expiresAt = new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  const invite = await db()
    .insert(accessInvites)
    .values({
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
      tokenHash,
      expiresAt,
      createdBy: session.user.id,
    })
    .returning({
      id: accessInvites.id,
      email: accessInvites.email,
      role: accessInvites.role,
      entityKind: accessInvites.entityKind,
      entityId: accessInvites.entityId,
      expiresAt: accessInvites.expiresAt,
    });

  const origin = getRequestOrigin(req);
  const inviteUrl = `${origin}/invite/${token}`;
  console.info('[dev-email]', {
    to: parsed.data.email.toLowerCase(),
    subject: `Sagan ${parsed.data.role} invite`,
    inviteUrl,
  });

  return NextResponse.json({ invite: invite[0], inviteUrl });
}
