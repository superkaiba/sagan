/**
 * Runner daemon entry point.
 *
 * - Subscribes to Postgres NOTIFY('agent_run_queued')
 * - Sweeps for any queued runs that arrived while we were down
 * - For each run, claims it (status: queued → running) and invokes runSession
 * - Persists every SDK message as an agent_run_events row
 *
 * Production: managed by systemd (see services/runner/systemd/eps-runner.service).
 * Local dev: `pnpm --filter @eps/runner dev`.
 */
import './env.js';
import cron from 'node-cron';
import { close, listener } from './db.js';
import { startQueue } from './queue.js';
import { runSession } from './session.js';
import { dispatchApprovedExperiment } from './dispatcher.js';
import { runLitReview } from './jobs/lit-review.js';
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
  // Manual trigger via the API (NOTIFY 'lit_review_run').
  void (async () => {
    const conn = listener();
    await conn.listen('lit_review_run', () => {
      log.info('lit-review: manual trigger via NOTIFY');
      runLitReview().catch((err) => log.error('lit-review manual failed', { err: String(err) }));
    });
    log.info('subscribed to lit_review_run');
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
