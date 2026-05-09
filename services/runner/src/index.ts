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
import { close } from './db.js';
import { startQueue } from './queue.js';
import { runSession } from './session.js';
import { log } from './log.js';

const controller = new AbortController();

async function main() {
  log.info('runner starting');
  await startQueue(async (runId) => {
    log.info('handling run', { runId });
    const outcome = await runSession(runId);
    log.info('run finished', { runId, outcome: outcome.ok ? outcome.status : 'failed' });
  }, controller.signal);

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
