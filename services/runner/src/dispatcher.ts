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
import { and, eq, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { db, schema } from './db.js';
import { emitEvent, QUEUED_CHANNEL } from './queue.js';
import { dispatchBatch, stopPod, type DispatchPodSpec, type RunpodAccount } from './tools/runpod.js';
import { log } from './log.js';
import { recordTrail } from './trail.js';
import { queueAutomaticRecoveryRun } from './lib/agent-recovery.js';
import { cascadeAgentRunFailureToScope } from './lib/cascade-failure.js';
import { EXPERIMENT_ORCHESTRATOR_PREFIX } from './session.js';

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

  // Insert the EPS-style post-approval orchestrator between plan-approval and
  // pod dispatch. The orchestrator walks the experiment through implementing
  // → code_reviewing → testing → running → uploading → verifying →
  // interpreting → reviewing → awaiting_promotion, spawning the matching
  // sub-agents from .claude/agents/ at each stage and calling launch-pod when
  // it's ready for the dispatcher. We mark this experiment-kind run as
  // completed once the orchestrator is queued — the experiment lifecycle
  // continues on the new run.
  //
  // Re-entry from launch-pod (orchestrator calling back when it's ready to
  // provision pods) is detected by an existing orchestrator run on this
  // scope, and goes straight to the dispatcher.
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    const orchestrators = await db()
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(
        and(
          eq(schema.agentRuns.scopeEntityId, run.scopeEntityId),
          eq(schema.agentRuns.kind, 'apply'),
          sql`${schema.agentRuns.request} LIKE ${`${EXPERIMENT_ORCHESTRATOR_PREFIX}${runId}%`}`,
        ),
      )
      .limit(1);
    if (orchestrators.length > 0) {
      await dispatchApprovedExperiment(runId);
      return;
    }
    await queuePostApprovalOrchestrator(run);
    return;
  }

  // Fallback for legacy/unscoped experiment runs: dispatch immediately the
  // old way.
  await dispatchApprovedExperiment(runId);
}

async function queuePostApprovalOrchestrator(parentRun: typeof schema.agentRuns.$inferSelect): Promise<void> {
  const orchestratorRequest = `${EXPERIMENT_ORCHESTRATOR_PREFIX}${parentRun.id}\n\nDrive experiment ${parentRun.scopeEntityId} from approved plan through awaiting_promotion. Sub-agents are loaded from .claude/agents/.`;
  const inserted = await db()
    .insert(schema.agentRuns)
    .values({
      kind: 'apply',
      provider: parentRun.provider,
      status: 'queued',
      request: orchestratorRequest,
      scopeEntityKind: parentRun.scopeEntityKind,
      scopeEntityId: parentRun.scopeEntityId,
      chatSessionId: parentRun.chatSessionId,
      runpodAccount: parentRun.runpodAccount,
      approvalRequired: false,
    })
    .returning({ id: schema.agentRuns.id });
  const orchestratorId = inserted[0]!.id;
  await emitEvent(parentRun.id, 'orchestrator_queued', orchestratorId, {
    stage: 'implementing',
    parentRunId: parentRun.id,
  });
  await db()
    .update(schema.agentRuns)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.agentRuns.id, parentRun.id));
  if (parentRun.scopeEntityKind === 'experiment' && parentRun.scopeEntityId) {
    await setExperimentStatus(parentRun.scopeEntityId, 'implementing', `Orchestrator ${orchestratorId.slice(0, 8)} queued to implement and dispatch.`);
  }
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${orchestratorId})`);
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
      await emitEvent(runId, 'deploy_pod_failed', r.error.slice(0, 500), {
        spec: dispatchSpecs[i],
        attempts: r.attempts,
      });
    }
  }

  // Partial-dispatch is treated as a hard failure: when the plan asked for N
  // pods and the allocator only gave us M < N, the experiment was designed
  // around N partitions and proceeding with M would silently produce a
  // broken result. Stop the survivors, mark the run blocked, and force the
  // owner to decide. The previous behavior — silently continuing on whatever
  // succeeded — caused the 365 "1 H100 instead of 4" surprise.
  const partial = succeeded > 0 && failed > 0;
  const finalSucceeded = partial ? 0 : succeeded;
  const finalRunStatus = finalSucceeded > 0 ? 'deploying' : 'blocked';
  if (partial) {
    for (const podId of podIds) {
      try {
        await stopPod(podId, account);
        await emitEvent(runId, 'partial_dispatch_pod_stopped', podId, { reason: 'partial_dispatch' });
      } catch (err) {
        await emitEvent(
          runId,
          'partial_dispatch_pod_stop_failed',
          err instanceof Error ? err.message : String(err),
          { podId },
        );
      }
    }
    failures.unshift(
      `Partial RunPod dispatch: ${succeeded}/${results.length} pods came up. ` +
        `Survivors were stopped because the plan was designed around ${results.length} partitions and ` +
        `proceeding with fewer would corrupt the result. Re-approve the plan to retry, or revise it to fit ` +
        `available capacity (smaller cloudType, different gpuType, fewer pods, or one pod with more GPUs).`,
    );
  }

  await db()
    .update(schema.agentRuns)
    .set({
      runpodPodIds: partial ? [] : podIds,
      runpodPodId: partial ? null : podIds[0] ?? null,
      runpodStatus: finalRunStatus === 'deploying' ? 'deploying' : 'blocked',
      status: finalRunStatus,
      lastError: failures.length ? failures.join('\n').slice(0, 4000) : null,
      completedAt: finalSucceeded > 0 ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, runId));

  await emitEvent(runId, finalSucceeded > 0 ? 'deploy_completed' : 'runpod_blocked',
    `dispatched ${succeeded}/${results.length} pod(s)`,
    { succeeded, failed, podIds, partial });
  await recordTrail({
    action: `Finished RunPod dispatch for run ${runId.slice(0, 8)}`,
    why: 'Record the outcome of the approved experiment launch.',
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId: runId,
    detail: `Dispatched ${succeeded}/${results.length} pod(s). Pod IDs: ${podIds.join(', ') || 'none'}`,
  });

  // Full failure OR partial-dispatch (which we just downgraded to "stopped
  // survivors, 0 effective pods"): hand the failure to the recovery loop so
  // the planning agent runs again with the failure transcript in its prompt
  // and can revise the plan to fit the available capacity (smaller cloud,
  // one larger pod, different gpuType, fewer partitions).
  if (finalSucceeded === 0) {
    const reason = failures.join('\n');
    if (experimentId) {
      await setExperimentStatus(experimentId, 'blocked', reason.slice(0, 1000));
    }
    const recovered = await queueAutomaticRecoveryRun(runId, reason).catch((recoveryErr) => {
      log.warn('failed to queue automatic recovery after dispatch failure', {
        runId,
        err: recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr),
      });
      return false;
    });
    if (!recovered) {
      await cascadeAgentRunFailureToScope({
        runId,
        scopeEntityKind: run.scopeEntityKind,
        scopeEntityId: run.scopeEntityId,
        reason: 'failed',
        detail: reason,
      });
    }
  }

  log.info('dispatch finished', { runId, succeeded, failed, podIds, partial });
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
