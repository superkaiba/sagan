/**
 * Runner daemon entry point.
 *
 * - Subscribes to Postgres NOTIFY('agent_run_queued')
 * - Sweeps for any queued runs that arrived while we were down
 * - For each run, claims it (status: queued → running) and invokes runSession
 * - Persists every SDK message as an agent_run_events row
 *
 * Production: managed by systemd (see services/runner/systemd/eps-runner.service).
 * Local dev: `pnpm --filter @sagan/runner dev`.
 */
import './env.js';
import cron from 'node-cron';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { close, db, listener, schema } from './db.js';
import { startQueue } from './queue.js';
import { runSession } from './session.js';
import { handleApprovedRun } from './dispatcher.js';
import { runLitReview } from './jobs/lit-review.js';
import { runWeeklyDigest } from './jobs/weekly-digest.js';
import { runInsightScan } from './jobs/insight-scan.js';
import { runTrackedJob, type JobContext } from './jobs/job-runs.js';
import { pushToUser } from './lib/push.js';
import { log } from './log.js';
import { startPodLifecycleWatcher, stopPodsForRun } from './watcher.js';

const controller = new AbortController();

async function main() {
  log.info('runner starting');
  await startQueue(
    {
      async onQueued(runId) {
        log.info('handling queued run', { runId });
        const outcome = await runSession(runId);
        log.info('queued run finished', {
          runId,
          outcome: outcome.ok ? outcome.status : 'failed',
        });
      },
      async onApproved(runId) {
        log.info('handling approved run', { runId });
        await handleApprovedRun(runId);
      },
    },
    controller.signal,
  );
  startPodLifecycleWatcher(controller.signal);

  // Daily lit review at 06:00 (server local time). Manual trigger via the
  // `RUN_LIT_REVIEW_AT_BOOT=1` env to run on startup as well.
  cron.schedule('0 6 * * *', () => {
    log.info('cron: lit-review starting');
    startTrackedJob('lit_review', 'cron').catch((err) => log.error('lit-review failed', { err: String(err) }));
  });
  if (process.env.RUN_LIT_REVIEW_AT_BOOT === '1') {
    log.info('lit-review: running on boot per RUN_LIT_REVIEW_AT_BOOT=1');
    startTrackedJob('lit_review', 'boot').catch((err) => log.error('lit-review at-boot failed', { err: String(err) }));
  }
  // Sunday 18:00: cross-project insight scan (proposes new edges).
  cron.schedule('0 18 * * 0', () => {
    log.info('cron: insight-scan starting');
    startTrackedJob('insight_scan', 'cron').catch((err) => log.error('insight-scan failed', { err: String(err) }));
  });
  // Sunday 22:00: draft the weekly advisor digest (after insight-scan so the
  // digest can mention any newly-proposed edges).
  cron.schedule('0 22 * * 0', () => {
    log.info('cron: weekly-digest starting');
    startTrackedJob('weekly_digest', 'cron').catch((err) => log.error('weekly-digest failed', { err: String(err) }));
  });

  await sweepQueuedTrackedJobs().catch((err) => log.error('job sweep failed', { err: String(err) }));
  const jobSweepTimer = setInterval(() => {
    sweepQueuedTrackedJobs().catch((err) => log.error('job sweep failed', { err: String(err) }));
  }, 60_000);
  controller.signal.addEventListener('abort', () => clearInterval(jobSweepTimer), { once: true });

  // Manual triggers via the API (NOTIFY).
  void (async () => {
    const conn = listener();
    await conn.listen('lit_review_run', (payload) => {
      log.info('lit-review: manual trigger via NOTIFY');
      startTrackedJob('lit_review', 'notify', payload).catch((err) =>
        log.error('lit-review manual failed', { err: String(err) }),
      );
    });
    await conn.listen('weekly_digest_run', (payload) => {
      log.info('weekly-digest: manual trigger via NOTIFY');
      startTrackedJob('weekly_digest', 'notify', payload).catch((err) =>
        log.error('weekly-digest manual failed', { err: String(err) }),
      );
    });
    await conn.listen('insight_scan_run', (payload) => {
      log.info('insight-scan: manual trigger via NOTIFY');
      startTrackedJob('insight_scan', 'notify', payload).catch((err) =>
        log.error('insight-scan manual failed', { err: String(err) }),
      );
    });
    await conn.listen('push_test', (payload) => {
      const userId = payload?.trim();
      if (!userId) return;
      log.info('push_test: trigger', { userId });
      pushToUser(userId, {
        title: 'EPS Research',
        body: 'Push notifications are working ✓',
        url: '/(tabs)/agent',
        data: { kind: 'test' },
      }).catch((err) => log.error('push_test failed', { err: String(err) }));
    });
    await conn.listen('runpod_stop_requested', (payload) => {
      const runId = parseRunId(payload);
      if (!runId) return;
      log.info('runpod_stop_requested: trigger', { runId });
      stopPodsForRun(runId).catch((err) => log.error('runpod stop failed', { runId, err: String(err) }));
    });
    log.info('subscribed to lit_review_run + weekly_digest_run + insight_scan_run + push_test + runpod_stop_requested');
  })();

  log.info('runner ready');
  await new Promise<void>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(), { once: true });
  });
}

type TrackedJobKind = 'lit_review' | 'weekly_digest' | 'insight_scan';
type JobRunKind = typeof schema.jobRuns.$inferSelect['kind'];

async function startTrackedJob(kind: TrackedJobKind, trigger: string, payload?: string) {
  const existingJobRunId = parseJobRunId(payload);
  const requestPayload = existingJobRunId ? undefined : { trigger, payload: payload?.trim() || null };
  return runTrackedJob(kind, (context) => runJob(kind, context), {
    existingJobRunId,
    requestPayload,
    trigger,
  });
}

async function runJob(kind: TrackedJobKind, context: JobContext) {
  switch (kind) {
    case 'lit_review':
      return runLitReview(context);
    case 'weekly_digest':
      return runWeeklyDigest(undefined, context);
    case 'insight_scan':
      return runInsightScan(context);
  }
}

async function sweepQueuedTrackedJobs() {
  const rows = await db()
    .select({ id: schema.jobRuns.id, kind: schema.jobRuns.kind })
    .from(schema.jobRuns)
    .where(
      and(
        eq(schema.jobRuns.status, 'queued'),
        inArray(schema.jobRuns.kind, ['lit_review', 'weekly_digest', 'insight_scan']),
      ),
    )
    .orderBy(asc(schema.jobRuns.createdAt))
    .limit(10);

  for (const row of rows) {
    if (!isTrackedJobKind(row.kind)) continue;
    startTrackedJob(row.kind, 'sweep', row.id).catch((err) =>
      log.error('queued job failed', { jobRunId: row.id, kind: row.kind, err: String(err) }),
    );
  }
}

function isTrackedJobKind(kind: JobRunKind): kind is TrackedJobKind {
  return kind === 'lit_review' || kind === 'weekly_digest' || kind === 'insight_scan';
}

function parseJobRunId(payload?: string): string | null {
  return parseRunId(payload);
}

function parseRunId(payload?: string): string | null {
  const trimmed = payload?.trim();
  if (!trimmed) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
}

async function shutdown(reason: string, code = 0) {
  log.info(`runner shutting down (${reason})`);
  controller.abort();
  await close();
  process.exit(code);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { err: String(err) });
  shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason: String(reason) });
  shutdown('unhandledRejection', 1);
});

main().catch((err) => {
  log.error('runner fatal', { err: String(err) });
  shutdown('fatal', 1);
});
