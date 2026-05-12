import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createApiToken, listApiTokens } from '@sagan/auth';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  expiresAt: z.string().datetime().optional(),
});

export async function GET() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const tokens = await listApiTokens(db(), session.user.id);
  return NextResponse.json({ tokens });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  const minted = await createApiToken(db(), session.user.id, parsed.data.name, expiresAt);
  return NextResponse.json({ token: minted });
}
