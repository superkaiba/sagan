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
import { close, listener } from './db.js';
import { startQueue } from './queue.js';
import { runSession } from './session.js';
import { dispatchApprovedExperiment } from './dispatcher.js';
import { runLitReview } from './jobs/lit-review.js';
import { runWeeklyDigest } from './jobs/weekly-digest.js';
import { runInsightScan } from './jobs/insight-scan.js';
import { pushToUser } from './lib/push.js';
import { log } from './log.js';

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
        await dispatchApprovedExperiment(runId);
      },
    },
    controller.signal,
  );

  // Daily lit review at 06:00 (server local time). Manual trigger via the
  // `RUN_LIT_REVIEW_AT_BOOT=1` env to run on startup as well.
  cron.schedule('0 6 * * *', () => {
    log.info('cron: lit-review starting');
    runLitReview().catch((err) => log.error('lit-review failed', { err: String(err) }));
  });
  if (process.env.RUN_LIT_REVIEW_AT_BOOT === '1') {
    log.info('lit-review: running on boot per RUN_LIT_REVIEW_AT_BOOT=1');
    runLitReview().catch((err) => log.error('lit-review at-boot failed', { err: String(err) }));
  }
  // Sunday 18:00: cross-project insight scan (proposes new edges).
  cron.schedule('0 18 * * 0', () => {
    log.info('cron: insight-scan starting');
    runInsightScan().catch((err) => log.error('insight-scan failed', { err: String(err) }));
  });
  // Sunday 22:00: draft the weekly advisor digest (after insight-scan so the
  // digest can mention any newly-proposed edges).
  cron.schedule('0 22 * * 0', () => {
    log.info('cron: weekly-digest starting');
    runWeeklyDigest().catch((err) => log.error('weekly-digest failed', { err: String(err) }));
  });
  // Manual triggers via the API (NOTIFY).
  void (async () => {
    const conn = listener();
    await conn.listen('lit_review_run', () => {
      log.info('lit-review: manual trigger via NOTIFY');
      runLitReview().catch((err) => log.error('lit-review manual failed', { err: String(err) }));
    });
    await conn.listen('weekly_digest_run', () => {
      log.info('weekly-digest: manual trigger via NOTIFY');
      runWeeklyDigest().catch((err) => log.error('weekly-digest manual failed', { err: String(err) }));
    });
    await conn.listen('insight_scan_run', () => {
      log.info('insight-scan: manual trigger via NOTIFY');
      runInsightScan().catch((err) => log.error('insight-scan manual failed', { err: String(err) }));
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
    log.info('subscribed to lit_review_run + weekly_digest_run + insight_scan_run + push_test');
  })();

  log.info('runner ready');
  await new Promise<void>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve(), { once: true });
  });
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
