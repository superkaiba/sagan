import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { pushDevices } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const registerSchema = z.object({
  token: z.string().min(8).max(512),
  platform: z.enum(['ios', 'android', 'web']),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const inserted = await db()
    .insert(pushDevices)
    .values({
      userId: session.user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
    })
    .onConflictDoUpdate({
      target: [pushDevices.userId, pushDevices.token],
      set: { lastSeenAt: sql`now()`, platform: parsed.data.platform },
    })
    .returning({ id: pushDevices.id, lastSeenAt: pushDevices.lastSeenAt });

  return NextResponse.json({ ok: true, device: inserted[0] });
}
