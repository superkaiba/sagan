import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from './db.js';
import { emitEvent } from './queue.js';
import { getPod, stopPod, type PodInfo, type RunpodAccount } from './tools/runpod.js';
import { log } from './log.js';
import { recordTrail } from './trail.js';

const DEFAULT_WATCH_INTERVAL_MS = 60_000;
const ACTIVE_POD_STATUSES = ['deploying', 'running', 'retrying', 'stop_requested'];
const TERMINAL_AGENT_STATUSES = ['completed', 'failed', 'cancelled', 'rejected', 'blocked'];

type PodLifecycleRow = typeof schema.podLifecycle.$inferSelect;

export function startPodLifecycleWatcher(signal: AbortSignal) {
  const intervalMs = watchIntervalMs();
  sweepPodLifecycle().catch((err) => log.error('pod watcher sweep failed', { err: String(err) }));

  const timer = setInterval(() => {
    sweepPodLifecycle().catch((err) => log.error('pod watcher sweep failed', { err: String(err) }));
  }, intervalMs);

  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
  log.info('pod lifecycle watcher started', { intervalMs });
}

export async function sweepPodLifecycle() {
  const rows = await db()
    .select()
    .from(schema.podLifecycle)
    .where(inArray(schema.podLifecycle.status, ACTIVE_POD_STATUSES))
    .limit(50);

  for (const row of rows) {
    await refreshPod(row).catch((err) =>
      handlePodRefreshError(row, err instanceof Error ? err.message : String(err)),
    );
  }
}

export async function stopPodsForRun(agentRunId: string) {
  const rows = await db()
    .select()
    .from(schema.podLifecycle)
    .where(
      and(
        eq(schema.podLifecycle.agentRunId, agentRunId),
        inArray(schema.podLifecycle.status, ['deploying', 'running', 'retrying', 'stop_requested']),
      ),
    );

  if (rows.length === 0) {
    await emitEvent(agentRunId, 'runpod_stop_skipped', 'no active pods found');
    return;
  }

  for (const row of rows) {
    await db()
      .update(schema.podLifecycle)
      .set({ status: 'stop_requested', updatedAt: new Date() })
      .where(eq(schema.podLifecycle.id, row.id));
    await emitEvent(agentRunId, 'runpod_stop_requested', row.runpodPodId);

    try {
      const pod = await stopPod(row.runpodPodId, row.account as RunpodAccount);
      await updatePodFromInfo(row, pod, 'stopped');
      await emitEvent(agentRunId, 'runpod_stopped', row.runpodPodId, {
        desiredStatus: pod.desiredStatus,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db()
        .update(schema.podLifecycle)
        .set({
          status: 'retrying',
          lastError: message.slice(0, 4000),
          updatedAt: new Date(),
        })
        .where(eq(schema.podLifecycle.id, row.id));
      await emitEvent(agentRunId, 'runpod_stop_failed', message.slice(0, 1000));
    }
  }

  await db()
    .update(schema.agentRuns)
    .set({ status: 'cancelled', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.agentRuns.id, agentRunId));
  await emitEvent(agentRunId, 'cancelled', 'active RunPod pods were stopped; volumes were preserved');

  const experimentIds = new Set(rows.map((row) => row.experimentId).filter((id): id is string => Boolean(id)));
  for (const experimentId of experimentIds) {
    await setExperimentWorkflowStatus(experimentId, 'cancelled', 'RunPod pod stopped; volume preserved.');
  }
}

async function refreshPod(row: PodLifecycleRow) {
  const pod = await getPod(row.runpodPodId, row.account as RunpodAccount);
  const status = mapPodStatus(pod);
  await updatePodFromInfo(row, pod, status);

  if (row.agentRunId) {
    await emitEvent(row.agentRunId, 'runpod_status', pod.desiredStatus || status, {
      podId: row.runpodPodId,
      status,
      sshHost: pod.sshHost,
      sshPort: pod.sshPort,
    });
    if (status === 'running') {
      await markAgentRunRunning(row.agentRunId);
    }
  }

  if (row.experimentId && status === 'running') {
    await setExperimentWorkflowStatus(row.experimentId, 'running', 'RunPod pod is running.');
  }
}

async function updatePodFromInfo(row: PodLifecycleRow, pod: PodInfo, status: string) {
  const now = new Date();
  await db()
    .update(schema.podLifecycle)
    .set({
      name: pod.name || row.name,
      gpuTypeId: pod.gpuTypeId ?? row.gpuTypeId,
      gpuCount: pod.gpuCount ?? row.gpuCount,
      status,
      desiredStatus: pod.desiredStatus,
      sshHost: pod.sshHost,
      sshPort: pod.sshPort,
      lastCheckedAt: now,
      lastHeartbeatAt: status === 'running' ? now : row.lastHeartbeatAt,
      stoppedAt: status === 'stopped' ? now : row.stoppedAt,
      terminatedAt: status === 'terminated' ? now : row.terminatedAt,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(schema.podLifecycle.id, row.id));
}

async function handlePodRefreshError(row: PodLifecycleRow, message: string) {
  const retryCount = row.retryCount + 1;
  const blocked = retryCount >= row.maxRetries;
  await db()
    .update(schema.podLifecycle)
    .set({
      status: blocked ? 'blocked' : 'retrying',
      retryCount,
      blockedReason: blocked ? message.slice(0, 4000) : row.blockedReason,
      lastError: message.slice(0, 4000),
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.podLifecycle.id, row.id));

  if (row.agentRunId) {
    await emitEvent(row.agentRunId, blocked ? 'runpod_blocked' : 'runpod_retry', message.slice(0, 1000), {
      podId: row.runpodPodId,
      retryCount,
      maxRetries: row.maxRetries,
    });
    if (blocked) {
      await db()
        .update(schema.agentRuns)
        .set({
          status: 'blocked',
          lastError: message.slice(0, 4000),
          updatedAt: new Date(),
        })
        .where(eq(schema.agentRuns.id, row.agentRunId));
      await recordTrail({
        action: `Blocked RunPod run ${row.agentRunId.slice(0, 8)}`,
        why: 'The RunPod watcher exhausted its retry budget.',
        entityKind: row.experimentId ? 'experiment' : undefined,
        entityId: row.experimentId ?? undefined,
        agentRunId: row.agentRunId,
        detail: message.slice(0, 500),
      });
    }
  }

  if (blocked && row.experimentId) {
    await setExperimentWorkflowStatus(row.experimentId, 'blocked', message.slice(0, 1000));
  }
}

async function markAgentRunRunning(agentRunId: string) {
  await db()
    .update(schema.agentRuns)
    .set({ status: 'running', runpodStatus: 'running', updatedAt: new Date() })
    .where(
      and(
        eq(schema.agentRuns.id, agentRunId),
        inArray(schema.agentRuns.status, ['approved', 'deploying', 'running']),
      ),
    );
}

async function setExperimentWorkflowStatus(experimentId: string, status: 'running' | 'blocked' | 'cancelled', note: string) {
  const rows = await db()
    .select({ status: schema.experiments.status })
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId))
    .limit(1);
  const current = rows[0];
  if (!current || current.status === status) return;
  if (TERMINAL_AGENT_STATUSES.includes(current.status)) return;

  await db()
    .update(schema.experiments)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.experiments.id, experimentId));
  await db().insert(schema.workflowEvents).values({
    entityKind: 'experiment',
    entityId: experimentId,
    eventType: status === 'blocked' ? 'blocked' : 'state_changed',
    fromStatus: current.status,
    toStatus: status,
    actorKind: 'runner',
    note,
  });
}

function mapPodStatus(pod: PodInfo) {
  const desired = pod.desiredStatus.toLowerCase();
  if (desired.includes('terminat')) return 'terminated';
  if (desired.includes('stop') || desired.includes('exit')) return 'stopped';
  if (desired.includes('running') || pod.sshHost) return 'running';
  return 'deploying';
}

function watchIntervalMs() {
  const configured = Number.parseInt(process.env.RUNPOD_WATCH_INTERVAL_MS ?? '', 10);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WATCH_INTERVAL_MS;
}
