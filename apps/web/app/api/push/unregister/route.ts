import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { pushDevices } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const schema = z.object({ token: z.string().min(8).max(500) });

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  await db()
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, session.user.id), eq(pushDevices.token, parsed.data.token)));
  return NextResponse.json({ ok: true });
}
