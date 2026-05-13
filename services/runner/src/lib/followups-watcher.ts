/**
 * Followups loop-back watcher.
 *
 * Background sweep that detects when a parent experiment in `followups_running`
 * has had ALL of its children (rows where `parent_experiment_id = parent.id`)
 * reach a terminal status. When that condition holds:
 *
 *   1. Transition the parent's status from `followups_running` to `interpreting`.
 *   2. Queue a kind='apply' agent_run whose `request` starts with
 *      `experiment-reinterpret-for:<parent.id>`. The dispatcher picks it up,
 *      services/runner/src/session.ts builds the experiment-reinterpret prompt
 *      from `.claude/prompts/runner/experiment-reinterpret-brief.md`, and the
 *      session re-runs analyzer + interpretation-critic pair, then exits in
 *      `reviewing`.
 *
 * The watcher is the single place that handles loop-back for BOTH the
 * auto-proposer's auto_run children (queued by the original orchestrator at
 * stage 8) AND the owner's T-checked follow-ups (queued from the review panel
 * via /api/experiments/[id]/queue-followups). Both land in `followups_running`
 * with `parent_experiment_id` set; this watcher resumes the workflow when they
 * finish.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { emitEvent } from '../queue.js';
import { log } from '../log.js';
import { EXPERIMENT_REINTERPRET_PREFIX } from '../session.js';

const QUEUED_CHANNEL = 'agent_run_queued';
const DEFAULT_INTERVAL_MS = 30_000;

// Statuses that count as "this child is done — its data (or lack thereof) is
// final and should be folded into the parent's re-interpretation."
// `blocked` is intentionally NOT here: a blocked child is stalled waiting for
// owner action, not finished. The parent should stay in `followups_running`
// until the owner unblocks (or archives) the child.
const TERMINAL_CHILD_STATUSES = [
  'done_experiment',
  'shared',
  'completed',
  'archived',
  'cancelled',
  'failed',
] as const;

export function startFollowupsWatcher(signal: AbortSignal) {
  const intervalMs = Number(process.env.SAGAN_FOLLOWUPS_WATCHER_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  sweepFollowups().catch((err) =>
    log.error('followups watcher sweep failed', { err: String(err) }),
  );
  const timer = setInterval(() => {
    sweepFollowups().catch((err) =>
      log.error('followups watcher sweep failed', { err: String(err) }),
    );
  }, intervalMs);
  signal.addEventListener('abort', () => clearInterval(timer), { once: true });
  log.info('followups loop-back watcher started', { intervalMs });
}

export async function sweepFollowups() {
  const parents = await db()
    .select({ id: schema.experiments.id, number: schema.experiments.number, title: schema.experiments.title })
    .from(schema.experiments)
    .where(eq(schema.experiments.status, 'followups_running'))
    .limit(50);

  for (const parent of parents) {
    await checkParent(parent).catch((err) =>
      log.error('followups watcher: parent check failed', {
        parentId: parent.id,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

async function checkParent(parent: { id: string; number: number | null; title: string }) {
  const children = await db()
    .select({ id: schema.experiments.id, status: schema.experiments.status })
    .from(schema.experiments)
    .where(eq(schema.experiments.parentExperimentId, parent.id));

  if (children.length === 0) {
    // Parent is in followups_running but has no children. This is an unusual
    // state (would happen if the orchestrator transitioned to
    // followups_running without queuing anything, or if all children were
    // deleted). Log once and skip — owner can manually transition.
    log.warn('followups watcher: parent in followups_running has no children', {
      parentId: parent.id,
    });
    return;
  }

  const allTerminal = children.every((c) =>
    (TERMINAL_CHILD_STATUSES as readonly string[]).includes(c.status),
  );
  if (!allTerminal) return;

  // Atomic guard: only transition if status is still 'followups_running'.
  // Avoids racing with another sweep or an owner-initiated change.
  const updated = await db()
    .update(schema.experiments)
    .set({ status: 'interpreting', updatedAt: new Date() })
    .where(
      and(
        eq(schema.experiments.id, parent.id),
        eq(schema.experiments.status, 'followups_running'),
      ),
    )
    .returning({ id: schema.experiments.id });
  if (updated.length === 0) {
    log.info('followups watcher: parent transitioned out from under us', { parentId: parent.id });
    return;
  }

  await db().insert(schema.workflowEvents).values({
    entityKind: 'experiment',
    entityId: parent.id,
    eventType: 'state_changed',
    fromStatus: 'followups_running',
    toStatus: 'interpreting',
    actorKind: 'system',
    note: `All ${children.length} follow-up child(ren) reached a terminal status; re-entering interpreting.`,
    metadata: {
      childIds: children.map((c) => c.id),
      childStatuses: Object.fromEntries(children.map((c) => [c.id, c.status])),
    },
  });

  // Queue the re-interpret agent_run. session.ts buildPrompt sees the prefix
  // and loads experiment-reinterpret-brief.md.
  const request = `${EXPERIMENT_REINTERPRET_PREFIX}${parent.id}`;
  const inserted = await db()
    .insert(schema.agentRuns)
    .values({
      kind: 'apply',
      provider: 'claude_code',
      status: 'queued',
      request,
      scopeEntityKind: 'experiment',
      scopeEntityId: parent.id,
      approvalRequired: false,
    })
    .returning({ id: schema.agentRuns.id });
  const runId = inserted[0]!.id;

  await emitEvent(runId, 'reinterpret_queued', `parent #${parent.number ?? '?'} resumed after ${children.length} follow-up(s)`);
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);

  log.info('followups watcher: queued reinterpret', {
    parentId: parent.id,
    parentNumber: parent.number,
    childCount: children.length,
    runId,
  });
}

// Lightweight exposure for tests / debugging that want to invoke a single
// sweep without starting the timer.
export { TERMINAL_CHILD_STATUSES, checkParent };

// `inArray` is imported above for symmetry with other watchers in this repo;
// re-export type-check usage to keep the import warning quiet under noUnused.
void inArray;
