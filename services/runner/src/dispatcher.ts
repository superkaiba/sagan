/**
 * Post-approval dispatcher for kind='experiment' agent runs.
 *
 * The plan-mode agent emits a markdown plan that includes a fenced
 * ```runpod-spec``` block — JSON describing the pods to dispatch. After a
 * human approves the run (status flips to 'approved'), this module:
 *
 *   1. Parses the spec block from plan_md.
 *   2. Calls dispatchBatch(specs).
 *   3. Inserts one `runs` row per spawned pod, linked to the experiment.
 *   4. Records the spawned pod IDs into agent_runs.runpod_pod_ids.
 *   5. Flips the agent_run to status='deploying' while pods are spinning up.
 *
 * Pod monitoring (W&B URL capture, completion detection) lives in a
 * separate watcher (services/runner/src/watcher.ts, Phase 2 follow-up).
 */
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, schema } from './db.js';
import { emitEvent } from './queue.js';
import { dispatchBatch, type DispatchPodSpec, type RunpodAccount } from './tools/runpod.js';
import { log } from './log.js';
import { recordTrail } from './trail.js';
import { queueAutomaticRecoveryRun } from './lib/agent-recovery.js';
import { cascadeAgentRunFailureToScope } from './lib/cascade-failure.js';

interface ParsedSpec {
  /** A descriptive name; defaults to <experiment_id>-<i>. */
  name?: string;
  gpuType: string; // 'H100' | 'H200' | 'A100' | 'L40S' | full RunPod ID
  gpuCount: number;
  image?: string;
  volumeGb?: number;
  containerDiskGb?: number;
  cloudType?: 'ALL' | 'SECURE' | 'COMMUNITY';
  dataCenterId?: string;
  dryRun?: boolean;
  /** Optional config payload that the pod's bootstrap will read. Stored on
   * the resulting `runs` row as configYaml (YAML-serialized) or as a free
   * text blob if it's already a string. */
  config?: Record<string, unknown> | string;
  /** Exact container start command. When supplied, RunPod runs it at boot. */
  dockerArgs?: string;
  /** Extra container environment variables. */
  env?: Record<string, string>;
  /** Optional initial estimate; live pod reports supersede it. */
  estimatedMinutes?: number;
  /** Optional W&B project pre-assignment for the resulting run. */
  wandbProject?: string;
}

const SPEC_BLOCK_RE = /```runpod-spec\s*\n([\s\S]*?)\n```/;

export function parseSpecsFromPlan(planMd: string): ParsedSpec[] {
  const match = planMd.match(SPEC_BLOCK_RE);
  if (!match) return [];
  const block = match[1]?.trim();
  if (!block) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new Error(
      'plan contained a ```runpod-spec``` block but it is not valid JSON. Wrap a single pod spec in {} or an array of specs in [].',
    );
  }
  const specs: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  return specs.map((s, i) => validateSpec(s, i));
}

function validateSpec(raw: unknown, index: number): ParsedSpec {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`spec[${index}]: must be an object`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.gpuType !== 'string' || r.gpuType.length === 0) {
    throw new Error(`spec[${index}]: gpuType must be a non-empty string`);
  }
  if (typeof r.gpuCount !== 'number' || !Number.isFinite(r.gpuCount) || r.gpuCount < 1) {
    throw new Error(`spec[${index}]: gpuCount must be a positive integer`);
  }
  return {
    name: typeof r.name === 'string' ? r.name : undefined,
    gpuType: r.gpuType,
    gpuCount: Math.floor(r.gpuCount),
    image: typeof r.image === 'string' ? r.image : undefined,
    volumeGb: typeof r.volumeGb === 'number' ? r.volumeGb : undefined,
    containerDiskGb: typeof r.containerDiskGb === 'number' ? r.containerDiskGb : undefined,
    cloudType:
      r.cloudType === 'ALL' || r.cloudType === 'SECURE' || r.cloudType === 'COMMUNITY'
        ? r.cloudType
        : undefined,
    dataCenterId: typeof r.dataCenterId === 'string' ? r.dataCenterId : undefined,
    dryRun: r.dryRun === true,
    config: typeof r.config === 'object' || typeof r.config === 'string' ? (r.config as ParsedSpec['config']) : undefined,
    dockerArgs: typeof r.dockerArgs === 'string' && r.dockerArgs.trim() ? r.dockerArgs : undefined,
    env: parseEnv(r.env),
    estimatedMinutes: typeof r.estimatedMinutes === 'number' && Number.isFinite(r.estimatedMinutes) && r.estimatedMinutes >= 0
      ? Math.floor(r.estimatedMinutes)
      : undefined,
    wandbProject: typeof r.wandbProject === 'string' ? r.wandbProject : undefined,
  };
}

function parseEnv(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.trim()) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Drive the post-approval workflow for a single run.
 *
 * Experiment approvals dispatch RunPod pods. Other approved runs are terminal:
 * the user accepted the plan/output, but there is no runner-side dispatch step.
 */
export async function handleApprovedRun(runId: string): Promise<void> {
  const rows = await db()
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) {
    log.error('dispatch: run not found', { runId });
    return;
  }
  if (run.status !== 'approved') {
    log.debug('dispatch: run is not approved', { runId, status: run.status });
    return;
  }

  if (run.kind !== 'experiment') {
    await finalizeApprovedNonExperiment(run);
    return;
  }

  await dispatchApprovedExperiment(runId);
}

/**
 * Drive the post-approval dispatch for a single experiment run.
 * Idempotent: if the run is already past 'approved' it no-ops.
 */
export async function dispatchApprovedExperiment(runId: string): Promise<void> {
  const rows = await db()
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) {
    log.error('dispatch: run not found', { runId });
    return;
  }
  if (run.kind !== 'experiment') {
    log.warn('dispatch: run is not an experiment', { runId, kind: run.kind });
    return;
  }
  if (run.status !== 'approved') {
    log.debug('dispatch: run is not approved', { runId, status: run.status });
    return;
  }
  if (!run.planMd) {
    await fail(runId, 'plan_md is empty; cannot dispatch');
    return;
  }

  let specs: ParsedSpec[];
  try {
    specs = parseSpecsFromPlan(run.planMd);
  } catch (err) {
    await fail(runId, err instanceof Error ? err.message : String(err));
    return;
  }
  if (specs.length === 0) {
    await fail(
      runId,
      'plan contained no ```runpod-spec``` block. The plan must include a fenced block describing the pod(s) to dispatch.',
    );
    return;
  }

  await db()
    .update(schema.agentRuns)
    .set({ status: 'deploying', updatedAt: new Date() })
    .where(eq(schema.agentRuns.id, runId));
  await emitEvent(runId, 'deploy_started', `dispatching ${specs.length} pod(s)`, {
    count: specs.length,
  });
  await recordTrail({
    action: `Started RunPod dispatch for experiment run ${runId.slice(0, 8)}`,
    why: 'The approved experiment plan included a runpod-spec block.',
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId: runId,
    detail: `Dispatching ${specs.length} pod(s) via account=${run.runpodAccount}`,
  });

  // Find the experiment this run is scoped to so we can attach `runs` rows and
  // issue pod-side progress credentials before dispatch.
  let experimentId: string | null = null;
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    experimentId = run.scopeEntityId;
  }

  const account: RunpodAccount = run.runpodAccount;
  const progressUrl = `${siteUrl()}/api/runpods/progress`;
  const progressTokens = specs.map(() => randomProgressToken());
  const dispatchSpecs: DispatchPodSpec[] = specs.map((s, i) => ({
    account,
    name: s.name ?? `${run.id.slice(0, 8)}-${i}`,
    gpuType: s.gpuType,
    gpuCount: s.gpuCount,
    image: s.image,
    volumeGb: s.volumeGb,
    containerDiskGb: s.containerDiskGb,
    cloudType: s.cloudType,
    dataCenterId: s.dataCenterId,
    dockerArgs: s.dockerArgs,
    env: {
      ...(s.env ?? {}),
      SAGAN_PROGRESS_URL: progressUrl,
      SAGAN_POD_PROGRESS_TOKEN: progressTokens[i]!,
      SAGAN_AGENT_RUN_ID: run.id,
      SAGAN_EXPERIMENT_ID: experimentId ?? '',
      SAGAN_RUN_INDEX: String(i),
    },
    dryRun: s.dryRun,
  }));

  const results = await dispatchBatch(dispatchSpecs);

  const podIds: string[] = [];
  let succeeded = 0;
  let failed = 0;
  const failures: string[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const spec = specs[i]!;
    if (r.ok) {
      succeeded++;
      podIds.push(r.pod.podId);
      await emitEvent(runId, 'deploy_pod_started', r.pod.podId, {
        gpuType: r.pod.gpuTypeId,
        gpuCount: r.pod.gpuCount,
        costPerHr: r.pod.costPerHr,
        adjustedCostPerHr: r.pod.adjustedCostPerHr,
      });
      let createdRunId: string | null = null;
      if (experimentId) {
        const insertedRun = await db().insert(schema.runs).values({
          experimentId,
          configYaml: typeof spec.config === 'string' ? spec.config : JSON.stringify(spec.config ?? null),
          notesMd: `Dispatched pod ${r.pod.podId} (${r.pod.name})`,
          startedAt: new Date(),
        }).returning({ id: schema.runs.id });
        createdRunId = insertedRun[0]?.id ?? null;
      }
      const lifecycle = await db().insert(schema.podLifecycle).values({
        agentRunId: runId,
        experimentId,
        runId: createdRunId,
        runpodPodId: r.pod.podId,
        account,
        name: r.pod.name,
        gpuTypeId: r.pod.gpuTypeId,
        gpuCount: r.pod.gpuCount,
        costPerHr: r.pod.costPerHr,
        adjustedCostPerHr: r.pod.adjustedCostPerHr,
        uptimeSeconds: r.pod.uptimeSeconds,
        lastStartedAt: parseRunpodDate(r.pod.lastStartedAt),
        status: r.pod.sshHost ? 'running' : 'deploying',
        desiredStatus: r.pod.desiredStatus,
        sshHost: r.pod.sshHost,
        sshPort: r.pod.sshPort,
        lastCheckedAt: new Date(),
        lastHeartbeatAt: r.pod.sshHost ? new Date() : undefined,
        metadata: {
          spec: dispatchSpecs[i],
          planSpec: spec,
          dryRun: spec.dryRun === true || process.env.RUNPOD_DRY_RUN === '1',
          saganProgress: {
            token: progressTokens[i],
            url: progressUrl,
            source: 'pending',
            estimatedMinutes: spec.estimatedMinutes ?? null,
          },
        },
      }).returning({ id: schema.podLifecycle.id });
      await db().insert(schema.runArtifacts).values({
        experimentId,
        runId: createdRunId,
        agentRunId: runId,
        podLifecycleId: lifecycle[0]?.id,
        kind: 'runpod_pod',
        uri: `runpod:${r.pod.podId}`,
        status: 'pending',
        metadata: {
          podId: r.pod.podId,
          name: r.pod.name,
          gpuTypeId: r.pod.gpuTypeId,
          gpuCount: r.pod.gpuCount,
          costPerHr: r.pod.costPerHr,
          adjustedCostPerHr: r.pod.adjustedCostPerHr,
        },
      });
      if (experimentId && r.pod.sshHost) {
        await setExperimentStatus(experimentId, 'running', 'RunPod pod is running.');
      } else if (experimentId) {
        await setExperimentStatus(experimentId, 'queued', 'RunPod pod dispatched; waiting for runtime.');
      }
    } else {
      failed++;
      failures.push(`spec[${i}]: ${r.error}`);
      await emitEvent(runId, 'deploy_pod_failed', r.error.slice(0, 500), { spec: dispatchSpecs[i] });
    }
  }

  await db()
    .update(schema.agentRuns)
    .set({
      runpodPodIds: podIds,
      runpodPodId: podIds[0] ?? null,
      runpodStatus: succeeded > 0 ? 'deploying' : 'blocked',
      status: succeeded > 0 ? 'deploying' : 'blocked',
      lastError: failures.length ? failures.join('\n').slice(0, 4000) : null,
      completedAt: succeeded > 0 ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, runId));
  if (succeeded === 0 && experimentId) {
    await setExperimentStatus(experimentId, 'blocked', failures.join('\n').slice(0, 1000));
  }

  await emitEvent(runId, succeeded > 0 ? 'deploy_completed' : 'runpod_blocked',
    `dispatched ${succeeded}/${results.length} pod(s)`,
    { succeeded, failed, podIds });
  await recordTrail({
    action: `Finished RunPod dispatch for run ${runId.slice(0, 8)}`,
    why: 'Record the outcome of the approved experiment launch.',
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId: runId,
    detail: `Dispatched ${succeeded}/${results.length} pod(s). Pod IDs: ${podIds.join(', ') || 'none'}`,
  });

  log.info('dispatch finished', { runId, succeeded, failed, podIds });
}

function randomProgressToken() {
  return randomBytes(32).toString('base64url');
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://sagan.superkaiba.com').replace(/\/+$/, '');
}

function parseRunpodDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

async function finalizeApprovedNonExperiment(run: typeof schema.agentRuns.$inferSelect) {
  const now = new Date();
  const updated = await db()
    .update(schema.agentRuns)
    .set({
      status: 'completed',
      completedAt: now,
      updatedAt: now,
      lastError: null,
    })
    .where(and(eq(schema.agentRuns.id, run.id), eq(schema.agentRuns.status, 'approved')))
    .returning({ id: schema.agentRuns.id });
  if (updated.length === 0) {
    log.debug('approved non-experiment already finalized', { runId: run.id, kind: run.kind });
    return;
  }

  await emitEvent(run.id, 'approval_finalized', `${run.kind} approval accepted; no dispatch required`, {
    kind: run.kind,
  });
  await recordTrail({
    action: `Accepted ${run.kind} run ${run.id.slice(0, 8)}`,
    why: `${run.kind} approvals do not launch RunPod jobs; the approved result is now recorded as complete.`,
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId: run.id,
    detail: (run.planMd ?? run.request).slice(0, 500),
  });
  log.info('finalized approved non-experiment run', { runId: run.id, kind: run.kind });
}

async function fail(runId: string, err: string) {
  log.error('dispatch failed', { runId, err });
  const runRows = await db()
    .select({
      scopeEntityKind: schema.agentRuns.scopeEntityKind,
      scopeEntityId: schema.agentRuns.scopeEntityId,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  const run = runRows[0];
  await db()
    .update(schema.agentRuns)
    .set({
      status: 'blocked',
      lastError: err.slice(0, 4000),
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, runId));
  await emitEvent(runId, 'runpod_blocked', err.slice(0, 1000));
  await recordTrail({
    action: `RunPod dispatch failed for run ${runId.slice(0, 8)}`,
    why: 'The approved experiment plan could not be launched.',
    entityKind: run?.scopeEntityKind ?? undefined,
    entityId: run?.scopeEntityId ?? undefined,
    agentRunId: runId,
    detail: err.slice(0, 500),
  });
  const recovered = await queueAutomaticRecoveryRun(runId, err).catch((recoveryErr) => {
    log.warn('failed to queue automatic recovery after dispatch failure', {
      runId,
      err: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
    });
    return false;
  });
  if (!recovered) {
    await cascadeAgentRunFailureToScope({
      runId,
      scopeEntityKind: run?.scopeEntityKind,
      scopeEntityId: run?.scopeEntityId,
      reason: 'failed',
      detail: err,
    });
  }
}

async function setExperimentStatus(
  experimentId: string,
  status: typeof schema.experiments.$inferSelect['status'],
  note: string,
) {
  const rows = await db()
    .select({ status: schema.experiments.status })
    .from(schema.experiments)
    .where(eq(schema.experiments.id, experimentId))
    .limit(1);
  const current = rows[0];
  if (!current || current.status === status) return;
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
