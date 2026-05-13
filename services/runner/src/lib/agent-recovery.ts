import { and, asc, eq, ilike, inArray, sql } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';

type AgentRunRow = typeof schema.agentRuns.$inferSelect;
type FollowupMode = 'continuation' | 'recovery';

const QUEUED_CHANNEL = 'agent_run_queued';
const PIPELINE_CHANNEL = 'pipeline_changed';
const CONTINUATION_RE = /stream ended without result|completed without final response|max turns|aborted|stopped before/i;
const AUTO_FOLLOWUP_MARKER_RE = /\[auto-(?:continuation|recovery)-for:[0-9a-f-]+\]/i;

const TODO_RECOVERY_TARGET: Record<AgentRunRow['kind'], typeof schema.todos.$inferSelect['status']> = {
  plan: 'planning',
  apply: 'running',
  qa: 'interpreting',
  experiment: 'planning',
};

export async function queueAutomaticContinuationRun(sourceRunId: string, reason: string): Promise<boolean> {
  if (!CONTINUATION_RE.test(reason)) return false;
  return queueAutomaticFollowupRun(sourceRunId, reason, 'continuation');
}

export async function queueAutomaticRecoveryRun(sourceRunId: string, reason: string): Promise<boolean> {
  return queueAutomaticFollowupRun(sourceRunId, reason, 'recovery');
}

async function queueAutomaticFollowupRun(
  sourceRunId: string,
  reason: string,
  mode: FollowupMode,
): Promise<boolean> {
  const source = await loadRun(sourceRunId);
  if (!source) return false;

  if (AUTO_FOLLOWUP_MARKER_RE.test(source.request)) {
    await insertEvent(sourceRunId, `auto_${mode}_skipped`, 'automatic follow-up depth cap reached');
    await recordTrail({
      action: `Skipped automatic ${mode} after ${sourceRunId.slice(0, 8)}`,
      why: 'The failed run was already an automatic follow-up; the runner caps automatic chains at one hop.',
      entityKind: source.scopeEntityKind,
      entityId: source.scopeEntityId,
      agentRunId: sourceRunId,
      detail: reason.slice(0, 500),
    });
    return false;
  }

  const marker = `[auto-${mode}-for:${sourceRunId}]`;
  const existing = await db()
    .select({ id: schema.agentRuns.id })
    .from(schema.agentRuns)
    .where(ilike(schema.agentRuns.request, `%${marker}%`))
    .limit(1);
  if (existing.length > 0) return false;

  const transcript = await buildRunTranscript(sourceRunId);
  const request = buildFollowupRequest({ mode, marker, source, reason, transcript });

  const inserted = await db()
    .insert(schema.agentRuns)
    .values({
      kind: source.kind,
      provider: source.provider,
      status: 'queued',
      request,
      approvalRequired: source.approvalRequired,
      scopeEntityKind: source.scopeEntityKind,
      scopeEntityId: source.scopeEntityId,
      chatSessionId: source.chatSessionId,
      runpodAccount: source.runpodAccount,
    })
    .returning({ id: schema.agentRuns.id });
  const followupId = inserted[0]!.id;

  await insertEvent(sourceRunId, `auto_${mode}_queued`, followupId);
  await recordTrail({
    action: `Queued automatic ${mode} run ${followupId.slice(0, 8)} after ${sourceRunId.slice(0, 8)}`,
    why:
      mode === 'continuation'
        ? 'The previous agent stopped before a final result, so another run will review the transcript and continue.'
        : 'The previous agent failed or appeared to crash, so another run will diagnose the failure and try to recover.',
    entityKind: source.scopeEntityKind,
    entityId: source.scopeEntityId,
    agentRunId: followupId,
    correlationId: sourceRunId,
    detail: reason.slice(0, 500),
  });
  await reopenScopeForFollowup(source, followupId, mode);
  await notifyQueued(followupId);
  await notifyPipelineChanged(`auto-${mode}:${sourceRunId}`);
  return true;
}

async function loadRun(runId: string): Promise<AgentRunRow | null> {
  const rows = await db()
    .select()
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function buildRunTranscript(sourceRunId: string) {
  const events = await db()
    .select({
      eventType: schema.agentRunEvents.eventType,
      body: schema.agentRunEvents.body,
      createdAt: schema.agentRunEvents.createdAt,
    })
    .from(schema.agentRunEvents)
    .where(eq(schema.agentRunEvents.runId, sourceRunId))
    .orderBy(asc(schema.agentRunEvents.createdAt))
    .limit(100);

  return events
    .map((event) => {
      const body = event.body ? `: ${truncate(event.body, 800)}` : '';
      return `- ${event.createdAt.toISOString()} ${event.eventType}${body}`;
    })
    .join('\n');
}

function buildFollowupRequest(input: {
  mode: FollowupMode;
  marker: string;
  source: AgentRunRow;
  reason: string;
  transcript: string;
}) {
  if (input.mode === 'continuation') {
    return `${input.marker}

The previous Claude Code run stopped before a final result.

Review what it already did, then continue to a final useful result. Do not repeat completed work. If continuing would be unsafe or underspecified, stop with a clear blocker and the exact question the user should answer.

Original request:
${input.source.request}

Stop reason:
${input.reason}

Previous run transcript:
${input.transcript}`;
  }

  return `${input.marker}

The previous Claude Code run failed or crashed.

First diagnose why it stopped using the transcript below. Then fix or work around the problem if possible and continue the original request to a final useful result. Do not repeat completed work. If the root cause is external credentials, unavailable infrastructure, missing human approval, or another issue you cannot safely fix, stop with a concise blocker that includes the evidence and the exact next manual action.

Original request:
${input.source.request}

Failure or crash reason:
${input.reason}

Previous run transcript:
${input.transcript}`;
}

async function reopenScopeForFollowup(source: AgentRunRow, followupId: string, mode: FollowupMode) {
  if (!source.scopeEntityKind || !source.scopeEntityId) return;
  if (source.scopeEntityKind === 'todo') {
    const target = TODO_RECOVERY_TARGET[source.kind] ?? 'running';
    const updated = await db()
      .update(schema.todos)
      .set({ status: target, updatedAt: new Date() })
      .where(
        and(
          eq(schema.todos.id, source.scopeEntityId),
          inArray(schema.todos.status, ['blocked', 'cancelled']),
        ),
      )
      .returning({ id: schema.todos.id, text: schema.todos.text });
    if (updated[0]) {
      await recordTrail({
        action: `Reopened task ${updated[0].text.slice(0, 80)} for automatic ${mode}`,
        why: 'A follow-up agent was queued to continue after a failed run.',
        entityKind: 'todo',
        entityId: updated[0].id,
        agentRunId: followupId,
        correlationId: source.id,
      });
    }
    return;
  }

  if (source.scopeEntityKind === 'experiment') {
    const target = source.kind === 'apply' ? 'running' : 'planning';
    const rows = await db()
      .select({ status: schema.experiments.status })
      .from(schema.experiments)
      .where(eq(schema.experiments.id, source.scopeEntityId))
      .limit(1);
    const current = rows[0];
    if (!current || !['blocked', 'failed', 'cancelled'].includes(current.status)) return;

    await db()
      .update(schema.experiments)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(schema.experiments.id, source.scopeEntityId));
    await db().insert(schema.workflowEvents).values({
      entityKind: 'experiment',
      entityId: source.scopeEntityId,
      eventType: 'state_changed',
      fromStatus: current.status,
      toStatus: target,
      actorKind: 'runner',
      note: `Automatic ${mode} queued after agent run ${source.id.slice(0, 8)} failed.`,
      metadata: { sourceAgentRunId: source.id, followupAgentRunId: followupId, mode },
    });
    return;
  }

  if (source.scopeEntityKind === 'clean_result') {
    await db()
      .update(schema.cleanResults)
      .set({ status: 'reviewing', updatedAt: new Date() })
      .where(and(eq(schema.cleanResults.id, source.scopeEntityId), eq(schema.cleanResults.status, 'blocked')));
  }
}

async function insertEvent(runId: string, eventType: string, body?: string) {
  await db().insert(schema.agentRunEvents).values({ runId, eventType, body });
}

async function notifyQueued(runId: string) {
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
}

async function notifyPipelineChanged(payload: string) {
  try {
    await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${payload})`);
  } catch (err) {
    log.warn('pipeline notify failed', { payload, err: String(err) });
  }
}

function truncate(value: string | undefined, length: number) {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}
