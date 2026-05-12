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
import { eq, and, inArray, sql, asc, lt } from 'drizzle-orm';
import { log } from './log.js';
import { recordTrail } from './trail.js';
import { cascadeAgentRunFailureToScope } from './lib/cascade-failure.js';

export const QUEUED_CHANNEL = 'agent_run_queued';
export const APPROVED_CHANNEL = 'agent_run_approved';
export const PIPELINE_CHANNEL = 'pipeline_changed';

const DEFAULT_STALE_RUNNING_MINUTES = 15;

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
  await recoverStaleRunningRuns();

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

async function recoverStaleRunningRuns() {
  const staleAfterMs = staleRunningAfterMs();
  const cutoff = new Date(Date.now() - staleAfterMs);
  const now = new Date();
  const staleMinutes = Math.round(staleAfterMs / 60_000);
  const rows = await db()
    .update(schema.agentRuns)
    .set({
      status: 'failed',
      lastError: `Runner marked this run stale after ${staleMinutes} minutes without an update.`,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(schema.agentRuns.status, 'running'), lt(schema.agentRuns.updatedAt, cutoff)))
    .returning({
      id: schema.agentRuns.id,
      updatedAt: schema.agentRuns.updatedAt,
      scopeEntityKind: schema.agentRuns.scopeEntityKind,
      scopeEntityId: schema.agentRuns.scopeEntityId,
    });

  for (const row of rows) {
    log.warn('recovered stale running agent run', { runId: row.id, previousUpdatedAt: row.updatedAt.toISOString() });
    await emitEvent(row.id, 'stale_recovered', `marked failed after stale running timeout`, {
      cutoff: cutoff.toISOString(),
      staleAfterMinutes: staleMinutes,
    }).catch((err) => log.warn('failed to record stale recovery event', { runId: row.id, err: String(err) }));
    await recordTrail({
      action: `Recovered stale running run ${row.id.slice(0, 8)}`,
      why: 'The runner found a running row whose updated_at was older than the configured stale timeout.',
      agentRunId: row.id,
      detail: `previousUpdatedAt=${row.updatedAt.toISOString()}; cutoff=${cutoff.toISOString()}`,
    });
    await cascadeAgentRunFailureToScope({
      runId: row.id,
      scopeEntityKind: row.scopeEntityKind,
      scopeEntityId: row.scopeEntityId,
      reason: 'stale',
      detail: `No runner activity for ${staleMinutes} minutes.`,
    });
    await notifyPipelineChanged(row.id);
  }
}

function staleRunningAfterMs() {
  const configured = Number.parseInt(process.env.RUNNER_STALE_RUNNING_MINUTES ?? '', 10);
  const minutes = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STALE_RUNNING_MINUTES;
  return minutes * 60_000;
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

/**
 * Broadcast that pipeline-relevant state changed. The dashboard listens for
 * this and pushes patches to connected clients. Payload is a short tag so
 * subscribers can decide what to refetch.
 */
export async function notifyPipelineChanged(payload: string): Promise<void> {
  try {
    await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${payload})`);
  } catch (err) {
    log.warn('pipeline notify failed', { payload, err: String(err) });
  }
}
