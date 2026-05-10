import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { pushDevices } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const schema = z.object({
  token: z.string().min(8).max(500),
  platform: z.enum(['ios', 'android', 'web']),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  // Idempotent: upsert on (user_id, token).
  await db()
    .insert(pushDevices)
    .values({
      userId: session.user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
    })
    .onConflictDoUpdate({
      target: [pushDevices.userId, pushDevices.token],
      set: { lastSeenAt: sql`now()` },
    });
  return NextResponse.json({ ok: true });
}
