import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function POST() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await db().execute(sql`SELECT pg_notify('weekly_digest_run', 'now')`);
  return NextResponse.json({ ok: true });
}
