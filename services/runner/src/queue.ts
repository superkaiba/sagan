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
import { eq, and, inArray, sql, asc } from 'drizzle-orm';
import { log } from './log.js';

export const QUEUED_CHANNEL = 'agent_run_queued';
export const APPROVED_CHANNEL = 'agent_run_approved';

export interface QueueHandlers {
  onQueued: (runId: string) => Promise<void>;
  onApproved: (runId: string) => Promise<void>;
}

export async function startQueue(handlers: QueueHandlers, signal: AbortSignal): Promise<void> {
  const conn = listener();

  const subQ = await conn.listen(QUEUED_CHANNEL, async (payload) => {
    if (!payload) return;
    const runId = payload.trim();
    log.debug('queue notify (queued)', { runId });
    handle(runId, 'queued', handlers);
  });
  const subA = await conn.listen(APPROVED_CHANNEL, async (payload) => {
    if (!payload) return;
    const runId = payload.trim();
    log.debug('queue notify (approved)', { runId });
    handle(runId, 'approved', handlers);
  });
  log.info(`subscribed to ${QUEUED_CHANNEL} and ${APPROVED_CHANNEL}`);

  // Sweep on startup for any rows we missed while down.
  await sweep(handlers);

  // Periodic sweep every 60s as a safety net for missed notifications.
  const timer = setInterval(() => {
    sweep(handlers).catch((err) => log.error('sweep failed', { err: String(err) }));
  }, 60_000);

  signal.addEventListener('abort', async () => {
    clearInterval(timer);
    await Promise.allSettled([subQ.unlisten(), subA.unlisten()]);
    log.info('queue stopped');
  });
}

async function sweep(handlers: QueueHandlers) {
  const rows = await db()
    .select({ id: schema.agentRuns.id, status: schema.agentRuns.status })
    .from(schema.agentRuns)
    .where(inArray(schema.agentRuns.status, ['queued', 'approved']))
    .orderBy(asc(schema.agentRuns.createdAt))
    .limit(50);
  for (const row of rows) {
    handle(row.id, row.status === 'approved' ? 'approved' : 'queued', handlers);
  }
}

const inflight = new Set<string>();

function handle(runId: string, kind: 'queued' | 'approved', handlers: QueueHandlers) {
  const tag = `${runId}:${kind}`;
  if (inflight.has(tag)) return;
  inflight.add(tag);
  claim(runId, kind, handlers)
    .catch((err) => log.error('run failed', { runId, kind, err: String(err) }))
    .finally(() => inflight.delete(tag));
}

async function claim(runId: string, kind: 'queued' | 'approved', handlers: QueueHandlers) {
  if (kind === 'queued') {
    const got = await db()
      .update(schema.agentRuns)
      .set({ status: 'running', startedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.status, 'queued')))
      .returning({ id: schema.agentRuns.id });
    if (got.length === 0) {
      log.debug('queued run not claimable', { runId });
      return;
    }
    log.info('claimed queued run', { runId });
    await handlers.onQueued(runId);
    return;
  }
  // Approved runs: don't change status here — the dispatcher decides.
  // Just check the row is still 'approved' to avoid double-handling.
  const rows = await db()
    .select({ status: schema.agentRuns.status })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  if (rows[0]?.status !== 'approved') {
    log.debug('approved run not claimable (status changed)', { runId, status: rows[0]?.status });
    return;
  }
  log.info('claimed approved run', { runId });
  await handlers.onApproved(runId);
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

/** Used by the API + tests to NOTIFY when a run is enqueued. */
export async function notifyQueued(runId: string): Promise<void> {
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
}

/** Used by the API + tests to NOTIFY when a human approves a run. */
export async function notifyApproved(runId: string): Promise<void> {
  await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${runId})`);
}
