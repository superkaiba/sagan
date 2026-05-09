/**
 * Postgres LISTEN/NOTIFY job queue for agent runs.
 *
 * On the API side: when an agent_runs row is inserted with status='queued',
 * a trigger (or the API route) calls `pg_notify('agent_run_queued', '<run_id>')`.
 *
 * On the runner side: this module subscribes to that channel and yields run
 * IDs for the main loop to claim with FOR UPDATE SKIP LOCKED.
 */
import { listener, db, schema } from './db.js';
import { eq, and, sql, asc } from 'drizzle-orm';
import { log } from './log.js';

export const NOTIFY_CHANNEL = 'agent_run_queued';

type QueueHandler = (runId: string) => Promise<void>;

export async function startQueue(handler: QueueHandler, signal: AbortSignal): Promise<void> {
  const conn = listener();

  // Subscribe.
  const sub = await conn.listen(NOTIFY_CHANNEL, async (payload) => {
    if (!payload) return;
    const runId = payload.trim();
    log.debug('queue notify', { runId });
    handle(runId, handler);
  });
  log.info(`subscribed to ${NOTIFY_CHANNEL}`);

  // Sweep on startup: pick up any queued runs that arrived while the runner
  // was down.
  await sweepQueued(handler);

  // Periodic sweep every 60s as a safety net for missed notifications.
  const sweep = setInterval(() => {
    sweepQueued(handler).catch((err) => log.error('sweep failed', { err: String(err) }));
  }, 60_000);

  signal.addEventListener('abort', async () => {
    clearInterval(sweep);
    await sub.unlisten();
    log.info('queue stopped');
  });
}

async function sweepQueued(handler: QueueHandler) {
  const rows = await db()
    .select({ id: schema.agentRuns.id })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.status, 'queued'))
    .orderBy(asc(schema.agentRuns.createdAt))
    .limit(20);
  for (const row of rows) handle(row.id, handler);
}

const inflight = new Set<string>();

function handle(runId: string, handler: QueueHandler) {
  if (inflight.has(runId)) return;
  inflight.add(runId);
  // Best-effort claim: flip status from 'queued' to 'running' atomically.
  claimAndRun(runId, handler).catch((err) => {
    log.error('run failed', { runId, err: String(err) });
  }).finally(() => inflight.delete(runId));
}

async function claimAndRun(runId: string, handler: QueueHandler) {
  const claim = await db()
    .update(schema.agentRuns)
    .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.status, 'queued')))
    .returning({ id: schema.agentRuns.id });

  if (claim.length === 0) {
    log.debug('run not claimable (already taken)', { runId });
    return;
  }

  log.info('claimed run', { runId });
  await handler(runId);
}

/** Insert an event row for a run. */
export async function emitEvent(
  runId: string,
  eventType: string,
  body?: string,
  metadata?: Record<string, unknown>,
) {
  await db().insert(schema.agentRunEvents).values({ runId, eventType, body, metadata });
}

/** Used by the API to NOTIFY when a run is enqueued. Exposed for tests. */
export async function notify(runId: string): Promise<void> {
  await db().execute(sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${runId})`);
}
