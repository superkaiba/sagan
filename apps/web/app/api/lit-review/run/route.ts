import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const CHANNEL = 'lit_review_run';

/**
 * Trigger an immediate lit-review pass on the runner. The runner subscribes
 * to NOTIFY('lit_review_run') and invokes runLitReview() out-of-band.
 */
export async function POST() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  await db().execute(sql`SELECT pg_notify(${CHANNEL}, 'now')`);
  return NextResponse.json({ ok: true });
}
