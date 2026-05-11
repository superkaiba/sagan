import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { createCorrelationId, createJobRun } from '@/lib/job-runs';

export async function POST() {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const correlationId = createCorrelationId('weekly_digest');
  const job = await createJobRun({
    kind: 'weekly_digest',
    requestedBy: session.user.id,
    requestPayload: { manual: true, correlationId },
  });
  await db().execute(sql`SELECT pg_notify('weekly_digest_run', ${job.id})`);
  await appendDailyLogTrailBestEffort({
    action: 'Manually triggered weekly digest generation',
    why: 'Draft a mentor/advisor summary from the existing logged work before the scheduled Sunday run.',
    detail: `Job ${job.id}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    jobRunId: job.id,
    correlationId,
  });
  return NextResponse.json({ ok: true, jobRunId: job.id, status: job.status, correlationId });
}
