import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { pushDevices } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

/**
 * Fire a test notification to every device registered for the signed-in
 * user. Useful for verifying the end-to-end push pipeline without waiting
 * for an agent run.
 */
export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const devices = await db()
    .select({ token: pushDevices.token })
    .from(pushDevices)
    .where(eq(pushDevices.userId, session.user.id));
  if (devices.length === 0) {
    return NextResponse.json({ error: 'no_devices' }, { status: 404 });
  }
  // Push from the runner side (it owns Expo's push API). Notify a private
  // channel; the runner subscribes and dispatches.
  await db().execute(sql`SELECT pg_notify('push_test', ${session.user.id})`);
  return NextResponse.json({ ok: true, devices: devices.length });
}
