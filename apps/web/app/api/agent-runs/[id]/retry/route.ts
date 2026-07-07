import { agentDispatchEnabled, agentDispatchDisabledResponse } from '@/lib/agent-dispatch';
import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { agentRunEvents, agentRuns, cleanResults, experiments, todos } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { setExperimentStatus } from '@/lib/workflow';

const QUEUED_CHANNEL = 'agent_run_queued';
const PIPELINE_CHANNEL = 'pipeline_changed';

const RETRYABLE_STATUSES = ['failed', 'blocked', 'cancelled', 'rejected'] as const;
const BLOCKED_TODO_TRANSITIONS: Record<string, (typeof todos.$inferSelect)['status']> = {
  plan: 'planning',
  apply: 'running',
  qa: 'interpreting',
  experiment: 'planning',
};

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!agentDispatchEnabled) return agentDispatchDisabledResponse();
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;

  const rows = await db()
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  const source = rows[0];
  if (!source) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (!RETRYABLE_STATUSES.includes(source.status as (typeof RETRYABLE_STATUSES)[number])) {
    return NextResponse.json(
      { error: 'not_retryable', message: `Run status is ${source.status}; retry is only available for failed runs.` },
      { status: 409 },
    );
  }

  const marker = `[manual-retry-of:${source.id}]`;
  const retryRequest = `${marker}

The previous Claude Code run ended without completing. Pick up where it left off — do not redo work that already finished cleanly.

Original request:
${source.request}

Previous failure reason:
${source.lastError ?? '(no recorded reason)'}`;

  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind: source.kind,
      provider: source.provider,
      status: 'queued',
      request: retryRequest,
      approvalRequired: source.approvalRequired,
      scopeEntityKind: source.scopeEntityKind,
      scopeEntityId: source.scopeEntityId,
      chatSessionId: source.chatSessionId,
      runpodAccount: source.runpodAccount,
    })
    .returning({ id: agentRuns.id });
  const newRunId = inserted[0]!.id;

  await db().insert(agentRunEvents).values({
    runId: source.id,
    eventType: 'manual_resume_queued',
    body: newRunId,
    metadata: { actorUserId: session.user.id },
  });
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${newRunId})`);

  // PR1's cascade may have moved the scoped entity to `blocked` when the
  // previous run failed. Flip it back to an active stage so the card visually
  // moves out of the Blocked column.
  if (source.scopeEntityKind === 'todo' && source.scopeEntityId) {
    const target = BLOCKED_TODO_TRANSITIONS[source.kind] ?? 'running';
    await db()
      .update(todos)
      .set({ status: target, updatedAt: new Date() })
      .where(and(eq(todos.id, source.scopeEntityId), inArray(todos.status, ['blocked', 'cancelled'])));
  } else if (source.scopeEntityKind === 'experiment' && source.scopeEntityId) {
    const rows = await db()
      .select({ status: experiments.status })
      .from(experiments)
      .where(eq(experiments.id, source.scopeEntityId))
      .limit(1);
    if (rows[0]?.status === 'blocked' || rows[0]?.status === 'cancelled') {
      await setExperimentStatus({
        experimentId: source.scopeEntityId,
        status: source.kind === 'apply' ? 'running' : 'planning',
        actorUserId: session.user.id,
        note: `Reopened after manual retry of agent run ${source.id.slice(0, 8)}.`,
      });
    }
  } else if (source.scopeEntityKind === 'clean_result' && source.scopeEntityId) {
    await db()
      .update(cleanResults)
      .set({ status: 'reviewing', updatedAt: new Date() })
      .where(and(eq(cleanResults.id, source.scopeEntityId), eq(cleanResults.status, 'blocked')));
  }

  await appendDailyLogTrailBestEffort({
    action: `Retried ${source.kind} agent run ${source.id.slice(0, 8)} as ${newRunId.slice(0, 8)}`,
    why: 'The owner retried a failed Claude Code session from the pipeline board.',
    entityKind: source.scopeEntityKind ?? undefined,
    entityId: source.scopeEntityId ?? undefined,
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: newRunId,
    correlationId: source.id,
    detail: `Previous failure: ${(source.lastError ?? '').slice(0, 400)}`,
  });

  await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${`retry:${source.id}`})`);

  return NextResponse.json({
    ok: true,
    runId: newRunId,
    sourceRunId: source.id,
    message: `Queued a resumed Claude Code session from ${source.id.slice(0, 8)}.`,
  });
}
