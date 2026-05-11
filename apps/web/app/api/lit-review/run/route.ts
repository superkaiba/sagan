import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { createCorrelationId, createJobRun } from '@/lib/job-runs';

const CHANNEL = 'lit_review_run';

/**
 * Trigger an immediate lit-review pass on the runner. The runner subscribes
 * to NOTIFY('lit_review_run') and invokes runLitReview() out-of-band.
 */
export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const correlationId = createCorrelationId('lit_review');
  const job = await createJobRun({
    kind: 'lit_review',
    requestedBy: session.user.id,
    requestPayload: { manual: true, correlationId },
  });
  await db().execute(sql`SELECT pg_notify(${CHANNEL}, ${job.id})`);
  await appendDailyLogTrailBestEffort({
    action: 'Manually triggered literature review',
    why: 'Refresh the surfaced reading queue from configured sources now instead of waiting for the scheduled run.',
    detail: `Job ${job.id}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    jobRunId: job.id,
    correlationId,
  });
  return NextResponse.json({ ok: true, jobRunId: job.id, status: job.status, correlationId });
}
