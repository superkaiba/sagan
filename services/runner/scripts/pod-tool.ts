/**
 * CLI for the pod-provisioner sub-agent (see .claude/agents/pod-provisioner.md).
 *
 * The agent runs an adaptive dispatch loop: it calls `attempt` with a candidate
 * spec, reads the structured JSON result, decides what to vary on
 * SUPPLY_CONSTRAINT (consolidate, swap cloud type, swap GPU family, swap
 * account, …), and repeats. When it lands a working fleet it calls `commit`
 * to finalize the agent_run. If it runs out of substitution options it calls
 * `escalate` to flip the run to awaiting_approval with a structured note.
 *
 * Subcommands:
 *   attempt              one dispatch attempt; returns success or structured error
 *   commit               finalize a successful fleet (status=deploying, deploy_completed)
 *   escalate             give up and flip run to awaiting_approval with summary
 *   record-substitution  audit log entry on the agent_run for every variant tried
 *   stop                 tear down a pod (cleanup during multi-pod partials)
 *
 * Every subcommand prints exactly one JSON object to stdout (success or error)
 * so the agent can parse the result. Errors go to stderr; the process exits 0
 * for "agent-handleable" outcomes (e.g. SUPPLY_CONSTRAINT from `attempt`) and
 * non-zero only for unrecoverable infrastructure errors (DB unreachable etc.).
 *
 * Invoke via:
 *   pnpm --filter @sagan/runner pod-tool <subcommand> [flags]
 */
import '../src/env.js';

import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db.js';
import { emitEvent } from '../src/queue.js';
import { recordTrail } from '../src/trail.js';
import {
  buildPodEnv,
  commitDispatchedPod,
  parseRunpodDate,
  randomProgressToken,
  setExperimentStatus,
  validatePodSpecs,
  type ParsedSpec,
} from '../src/dispatcher.js';
import {
  dispatchPod,
  stopPod as runpodStopPod,
  type DispatchPodSpec,
  type RunpodAccount,
} from '../src/tools/runpod.js';

interface AgentRunRow {
  id: string;
  kind: string;
  status: string;
  scopeEntityKind: string | null;
  scopeEntityId: string | null;
  runpodAccount: RunpodAccount;
}

function emit(result: unknown): never {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

function fatal(message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, fatal: true, error: { code: 'fatal', message } })}\n`);
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0) return args[idx + 1];
  const equalsForm = args.find((a) => a.startsWith(`--${name}=`));
  return equalsForm?.slice(name.length + 3);
}

function requireFlag(args: string[], name: string): string {
  const v = flag(args, name);
  if (!v) fatal(`missing required flag --${name}`);
  return v;
}

function parseAccount(value: string | undefined, fallback: RunpodAccount): RunpodAccount {
  if (!value) return fallback;
  if (value === 'team' || value === 'personal') return value;
  fatal(`--account must be 'team' or 'personal', got '${value}'`);
}

async function loadAgentRun(runId: string): Promise<AgentRunRow> {
  const rows = await db()
    .select({
      id: schema.agentRuns.id,
      kind: schema.agentRuns.kind,
      status: schema.agentRuns.status,
      scopeEntityKind: schema.agentRuns.scopeEntityKind,
      scopeEntityId: schema.agentRuns.scopeEntityId,
      runpodAccount: schema.agentRuns.runpodAccount,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  const row = rows[0];
  if (!row) fatal(`agent_run ${runId} not found`);
  return row as AgentRunRow;
}

// ─── attempt ────────────────────────────────────────────────────────────────
//
// One dispatch attempt against RunPod. On success, commits the per-pod side
// effects (pod_lifecycle, runs, run_artifacts inserts; deploy_pod_started
// event; experiment status flip) so the pod is fully tracked even if the
// agent crashes before it can call `commit`. On failure, prints a structured
// error the agent can branch on.
//
// Required flags:
//   --agent-run-id <uuid>     the kind=experiment agent_run being dispatched
//   --spec-json <json>        one ParsedSpec object (NOT an array)
//   --run-index <int>         monotonically increasing index for SAGAN_RUN_INDEX
// Optional flags:
//   --account team|personal   defaults to the agent_run's runpodAccount
//
// Exit: always 0 unless infrastructure-fatal. Output: {ok: true, pod: {...}}
// or {ok: false, error: { code, message }}.

async function cmdAttempt(args: string[]) {
  const agentRunId = requireFlag(args, 'agent-run-id');
  const specJson = requireFlag(args, 'spec-json');
  const runIndex = Number.parseInt(requireFlag(args, 'run-index'), 10);
  if (!Number.isFinite(runIndex) || runIndex < 0) fatal('--run-index must be a non-negative integer');

  const run = await loadAgentRun(agentRunId);
  if (run.kind !== 'experiment') {
    fatal(`agent_run ${agentRunId} kind=${run.kind}; pod-tool attempt requires kind=experiment`);
  }
  const account = parseAccount(flag(args, 'account'), run.runpodAccount);

  let rawSpec: unknown;
  try {
    rawSpec = JSON.parse(specJson);
  } catch (err) {
    fatal(`--spec-json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  let spec: ParsedSpec;
  try {
    spec = validatePodSpecs(rawSpec)[0]!;
  } catch (err) {
    fatal(`spec failed validation: ${err instanceof Error ? err.message : String(err)}`);
  }

  const experimentId =
    run.scopeEntityKind === 'experiment' && run.scopeEntityId ? run.scopeEntityId : null;
  const progressToken = randomProgressToken();
  const dispatchSpec: DispatchPodSpec = {
    account,
    name: spec.name ?? `${run.id.slice(0, 8)}-${runIndex}`,
    gpuType: spec.gpuType,
    gpuCount: spec.gpuCount,
    image: spec.image,
    volumeGb: spec.volumeGb,
    containerDiskGb: spec.containerDiskGb,
    cloudType: spec.cloudType,
    dataCenterId: spec.dataCenterId,
    networkVolumeId: spec.networkVolumeId,
    dockerArgs: spec.dockerArgs,
    env: buildPodEnv({
      agentRunId: run.id,
      experimentId,
      runIndex,
      progressToken,
      estimatedMinutes: spec.estimatedMinutes,
      userEnv: spec.env,
    }),
    dryRun: spec.dryRun,
  };

  await emitEvent(agentRunId, 'pod_provisioner_attempt', `gpu=${spec.gpuType}x${spec.gpuCount} cloud=${spec.cloudType ?? 'ALL'} account=${account}`, {
    runIndex,
    spec: dispatchSpec,
  });

  try {
    const pod = await dispatchPod(dispatchSpec);
    const { podLifecycleId, runId: createdRunId } = await commitDispatchedPod({
      agentRunId: run.id,
      experimentId,
      account,
      spec,
      dispatchSpec,
      pod,
      progressToken,
    });
    emit({
      ok: true,
      pod: {
        podId: pod.podId,
        name: pod.name,
        gpuTypeId: pod.gpuTypeId,
        gpuCount: pod.gpuCount,
        desiredStatus: pod.desiredStatus,
        sshHost: pod.sshHost,
        sshPort: pod.sshPort,
        costPerHr: pod.costPerHr,
        adjustedCostPerHr: pod.adjustedCostPerHr,
      },
      podLifecycleId,
      sagaRunId: createdRunId,
      account,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = classifyError(message);
    await emitEvent(agentRunId, 'pod_provisioner_attempt_failed', message.slice(0, 500), {
      runIndex,
      spec: dispatchSpec,
      code,
    });
    emit({
      ok: false,
      error: {
        code,
        message: message.slice(0, 1000),
        // Hint which dimensions are reasonable to vary next; the agent decides.
        suggested_dimensions:
          code === 'SUPPLY_CONSTRAINT'
            ? ['consolidate_pods', 'cloudType', 'dataCenterId', 'gpuType', 'account']
            : code === 'AUTH'
              ? []
              : ['retry_same_spec_with_backoff'],
      },
    });
  }
}

function classifyError(message: string): string {
  if (/SUPPLY_CONSTRAINT|no longer any instances available|returned null — no capacity/i.test(message)) {
    return 'SUPPLY_CONSTRAINT';
  }
  if (/INTERNAL_SERVER_ERROR|HTTP 5\d\d/i.test(message)) return 'TRANSIENT_RUNPOD_ERROR';
  if (/RUNPOD_API_KEY|RUNPOD_TEAM_ID|HTTP 4\d\d|invalid input|UNAUTHENTICATED/i.test(message)) {
    return 'AUTH_OR_BAD_REQUEST';
  }
  if (/Network error|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message)) return 'NETWORK';
  return 'UNKNOWN';
}

// ─── commit ─────────────────────────────────────────────────────────────────
//
// Finalize a successful dispatch. Reads pod_lifecycle rows the agent created
// during `attempt`, writes runpod_pod_ids back onto agent_runs, flips status
// to 'deploying', and emits deploy_completed.
//
// Required flags:
//   --agent-run-id <uuid>

async function cmdCommit(args: string[]) {
  const agentRunId = requireFlag(args, 'agent-run-id');
  const run = await loadAgentRun(agentRunId);
  if (run.kind !== 'experiment') fatal(`agent_run kind=${run.kind}; commit requires kind=experiment`);

  const podRows = await db()
    .select({
      podId: schema.podLifecycle.runpodPodId,
      account: schema.podLifecycle.account,
      gpuTypeId: schema.podLifecycle.gpuTypeId,
      gpuCount: schema.podLifecycle.gpuCount,
    })
    .from(schema.podLifecycle)
    .where(eq(schema.podLifecycle.agentRunId, agentRunId));

  const podIds = podRows.map((p) => p.podId);
  if (podIds.length === 0) {
    fatal(`no pod_lifecycle rows for agent_run ${agentRunId}; call attempt before commit`);
  }

  await db()
    .update(schema.agentRuns)
    .set({
      runpodPodIds: podIds,
      runpodPodId: podIds[0]!,
      runpodStatus: 'deploying',
      status: 'deploying',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, agentRunId));

  await emitEvent(agentRunId, 'deploy_completed', `pod-provisioner committed ${podIds.length} pod(s)`, {
    succeeded: podIds.length,
    failed: 0,
    podIds,
    partial: false,
    via: 'pod-provisioner',
  });
  await recordTrail({
    action: `pod-provisioner committed ${podIds.length} pod(s) for run ${agentRunId.slice(0, 8)}`,
    why: 'Adaptive dispatch loop finished successfully.',
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId,
    detail: `Pod IDs: ${podIds.join(', ')}`,
  });
  emit({ ok: true, podIds, count: podIds.length });
}

// ─── escalate ───────────────────────────────────────────────────────────────
//
// Agent gives up. Flip run to awaiting_approval, set experiment to blocked,
// emit a structured note listing every attempt so the owner can decide.
//
// Required flags:
//   --agent-run-id <uuid>
//   --summary <text>            one-line explanation for the owner
// Optional flags:
//   --attempts-json '[{...}]'   structured list of attempts the agent tried

async function cmdEscalate(args: string[]) {
  const agentRunId = requireFlag(args, 'agent-run-id');
  const summary = requireFlag(args, 'summary');
  const attemptsJson = flag(args, 'attempts-json') ?? '[]';
  let attempts: unknown[] = [];
  try {
    const parsed = JSON.parse(attemptsJson);
    if (Array.isArray(parsed)) attempts = parsed;
  } catch {
    /* tolerate missing/garbage attempts-json — escalation should not double-fail */
  }
  const run = await loadAgentRun(agentRunId);

  await db()
    .update(schema.agentRuns)
    .set({
      status: 'awaiting_approval',
      lastError: summary.slice(0, 4000),
      updatedAt: new Date(),
    })
    .where(eq(schema.agentRuns.id, agentRunId));

  await emitEvent(agentRunId, 'runpod_blocked', summary.slice(0, 1000), {
    via: 'pod-provisioner',
    attempts,
  });
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    await setExperimentStatus(run.scopeEntityId, 'blocked', summary.slice(0, 1000));
  }
  await recordTrail({
    action: `pod-provisioner escalated run ${agentRunId.slice(0, 8)} to awaiting_approval`,
    why: 'Adaptive dispatch loop exhausted the substitution policy.',
    entityKind: run.scopeEntityKind,
    entityId: run.scopeEntityId,
    agentRunId,
    detail: `${summary} (${attempts.length} attempts)`,
  });
  emit({ ok: true, status: 'awaiting_approval', attempts_logged: attempts.length });
}

// ─── record-substitution ────────────────────────────────────────────────────
//
// Optional audit log: agent calls this every time it deviates from the
// planner's preferred spec. Surfaces in the dashboard as a "Substitutions"
// section on the run page.
//
// Required flags:
//   --agent-run-id <uuid>
//   --attempt <int>
//   --from-json <json>          spec the agent was asked for
//   --to-json <json>            spec the agent actually dispatched
//   --reason <text>             why the agent substituted

async function cmdRecordSubstitution(args: string[]) {
  const agentRunId = requireFlag(args, 'agent-run-id');
  const attempt = Number.parseInt(requireFlag(args, 'attempt'), 10);
  const reason = requireFlag(args, 'reason');
  let from: unknown = null;
  let to: unknown = null;
  try {
    from = JSON.parse(requireFlag(args, 'from-json'));
  } catch (err) {
    fatal(`--from-json invalid: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    to = JSON.parse(requireFlag(args, 'to-json'));
  } catch (err) {
    fatal(`--to-json invalid: ${err instanceof Error ? err.message : String(err)}`);
  }
  await db().insert(schema.agentRunEvents).values({
    runId: agentRunId,
    eventType: 'pod_substitution',
    body: reason.slice(0, 4000),
    metadata: { attempt, from, to },
  });
  emit({ ok: true });
}

// ─── stop ───────────────────────────────────────────────────────────────────
//
// Cleanup utility. The agent calls this when it abandons a partially-launched
// fleet (e.g. one pod of two came up, second won't, so kill the first before
// retrying as a single multi-GPU pod).
//
// Required flags:
//   --pod-id <runpod-id>
// Optional flags:
//   --account team|personal     defaults to 'personal'

async function cmdStop(args: string[]) {
  const podId = requireFlag(args, 'pod-id');
  const account = parseAccount(flag(args, 'account'), 'personal');
  try {
    const info = await runpodStopPod(podId, account);
    // Reflect stopped state on pod_lifecycle so the watcher doesn't keep polling.
    await db()
      .update(schema.podLifecycle)
      .set({
        status: 'stopped',
        desiredStatus: info.desiredStatus,
        lastCheckedAt: new Date(),
        stoppedAt: parseRunpodDate(info.lastStartedAt) ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.podLifecycle.runpodPodId, podId));
    emit({ ok: true, podId, desiredStatus: info.desiredStatus });
  } catch (err) {
    emit({ ok: false, error: { code: 'STOP_FAILED', message: err instanceof Error ? err.message : String(err) } });
  }
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'attempt':
      return cmdAttempt(rest);
    case 'commit':
      return cmdCommit(rest);
    case 'escalate':
      return cmdEscalate(rest);
    case 'record-substitution':
      return cmdRecordSubstitution(rest);
    case 'stop':
      return cmdStop(rest);
    default:
      process.stderr.write(
        `usage: pod-tool <attempt|commit|escalate|record-substitution|stop> [flags]\n` +
          `       see scripts/pod-tool.ts header for full flag list\n`,
      );
      process.exit(2);
  }
}

main().catch((err) => {
  fatal(err instanceof Error ? err.message : String(err));
});
