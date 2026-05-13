/**
 * Cascade an agent_run failure / stale / cancel onto the scoped entity it was
 * working on. Claude Code can't move its own card to blocked when the session
 * crashes — this helper does it from the runner.
 *
 * Idempotent: only flips a status if the entity is in an active state the
 * agent was actively servicing. Won't overwrite a manual move the user did
 * after dispatching the run.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';
import { postBlockedRunSummary } from './blocking-summary.js';

type AgentRunRow = typeof schema.agentRuns.$inferSelect;
type EntityKind = NonNullable<AgentRunRow['scopeEntityKind']>;
type CascadeReason = 'failed' | 'stale' | 'cancelled';

const ACTIVE_TODO_STATUSES = ['running', 'in_progress', 'planning', 'interpreting'] as const;
const ACTIVE_EXPERIMENT_STATUSES = [
  'clarifying',
  'running',
  'queued',
  'approved',
  'implementing',
  'code_reviewing',
  'testing',
  'planning',
  'interpreting',
  'uploading',
  'verifying',
  'reviewing',
  'clean_result_drafting',
  'followups_running',
] as const;
const ACTIVE_CLEAN_RESULT_STATUSES = ['draft', 'reviewing'] as const;

export interface CascadeInput {
  runId: string;
  scopeEntityKind: EntityKind | null | undefined;
  scopeEntityId: string | null | undefined;
  reason: CascadeReason;
  detail: string;
}

export async function cascadeAgentRunFailureToScope(input: CascadeInput): Promise<void> {
  if (!input.scopeEntityKind || !input.scopeEntityId) return;
  switch (input.scopeEntityKind) {
    case 'todo':
      return cascadeTodo(input);
    case 'experiment':
      return cascadeExperiment(input);
    case 'clean_result':
      return cascadeCleanResult(input);
    default:
      return;
  }
}

async function cascadeTodo(input: CascadeInput) {
  const updated = await db()
    .update(schema.todos)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(
      and(
        eq(schema.todos.id, input.scopeEntityId!),
        inArray(schema.todos.status, [...ACTIVE_TODO_STATUSES]),
      ),
    )
    .returning({ id: schema.todos.id, text: schema.todos.text });
  const row = updated[0];
  if (!row) {
    log.debug('cascade: todo not in active state, skipped', {
      todoId: input.scopeEntityId,
      runId: input.runId,
    });
    return;
  }
  await recordTrail({
    action: `Auto-blocked task ${row.text.slice(0, 80)} after run ${input.runId.slice(0, 8)} ${input.reason}`,
    why: 'The Claude Code session ended without completing. The task was moved to blocked so it appears on the owner board.',
    entityKind: 'todo',
    entityId: row.id,
    agentRunId: input.runId,
    detail: input.detail.slice(0, 500),
  });
  await postBlockedRunSummary({
    runId: input.runId,
    entityKind: 'todo',
    entityId: row.id,
    reason: input.reason,
    detail: input.detail,
  });
}

async function cascadeExperiment(input: CascadeInput) {
  const rows = await db()
    .select({ status: schema.experiments.status, title: schema.experiments.title })
    .from(schema.experiments)
    .where(eq(schema.experiments.id, input.scopeEntityId!))
    .limit(1);
  const row = rows[0];
  if (!row) return;
  if (!ACTIVE_EXPERIMENT_STATUSES.includes(row.status as typeof ACTIVE_EXPERIMENT_STATUSES[number])) {
    log.debug('cascade: experiment not in active state, skipped', {
      experimentId: input.scopeEntityId,
      status: row.status,
      runId: input.runId,
    });
    return;
  }
  await db()
    .update(schema.experiments)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(eq(schema.experiments.id, input.scopeEntityId!));
  await db().insert(schema.workflowEvents).values({
    entityKind: 'experiment',
    entityId: input.scopeEntityId!,
    eventType: 'blocked',
    fromStatus: row.status,
    toStatus: 'blocked',
    actorKind: 'runner',
    note: `Cascaded from agent_run ${input.runId.slice(0, 8)} ${input.reason}`,
    metadata: { agentRunId: input.runId, reason: input.reason },
  });
  await recordTrail({
    action: `Auto-blocked experiment ${row.title.slice(0, 80)} after run ${input.runId.slice(0, 8)} ${input.reason}`,
    why: 'The Claude Code session ended without completing.',
    entityKind: 'experiment',
    entityId: input.scopeEntityId!,
    agentRunId: input.runId,
    detail: input.detail.slice(0, 500),
  });
  await postBlockedRunSummary({
    runId: input.runId,
    entityKind: 'experiment',
    entityId: input.scopeEntityId!,
    reason: input.reason,
    detail: input.detail,
  });
}

async function cascadeCleanResult(input: CascadeInput) {
  const updated = await db()
    .update(schema.cleanResults)
    .set({ status: 'blocked', updatedAt: new Date() })
    .where(
      and(
        eq(schema.cleanResults.id, input.scopeEntityId!),
        inArray(schema.cleanResults.status, [...ACTIVE_CLEAN_RESULT_STATUSES]),
      ),
    )
    .returning({ id: schema.cleanResults.id, title: schema.cleanResults.title });
  const row = updated[0];
  if (!row) return;
  await recordTrail({
    action: `Auto-blocked clean result ${row.title.slice(0, 80)} after run ${input.runId.slice(0, 8)} ${input.reason}`,
    why: 'The Claude Code review session ended without completing.',
    entityKind: 'clean_result',
    entityId: row.id,
    agentRunId: input.runId,
    detail: input.detail.slice(0, 500),
  });
  await postBlockedRunSummary({
    runId: input.runId,
    entityKind: 'clean_result',
    entityId: row.id,
    reason: input.reason,
    detail: input.detail,
  });
}
