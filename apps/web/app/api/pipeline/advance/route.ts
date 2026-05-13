import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRunEvents, agentRuns, cleanResults, dailyLogEntries, experiments, ideaCards, todos } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { db } from '@/lib/db';
import { statusTone } from '@/lib/status';
import { appendWorkflowEvent, experimentTurn, setExperimentStatus, type ExperimentStatus } from '@/lib/workflow';
import type { EntityKind } from '@/lib/entity';

const QUEUED_CHANNEL = 'agent_run_queued';
const APPROVED_CHANNEL = 'agent_run_approved';
const PIPELINE_CHANNEL = 'pipeline_changed';
const PIPELINE_STAGE_NOTE_PREFIX = 'sagan:pipeline-stage=';

async function notifyPipelineChanged(payload: string) {
  try {
    await db().execute(sql`SELECT pg_notify(${PIPELINE_CHANNEL}, ${payload})`);
  } catch {
    // Best effort. Subscribers also poll on a slow timer as a safety net.
  }
}

const pipelineStageSchema = z.enum([
  'later',
  'idea',
  'clarifying',
  'awaiting_clarifications',
  'planning',
  'approval',
  'queued',
  'running',
  'interpreting',
  'followups_running',
  'clean_results',
  'blocked',
  'review',
  'done',
  'archived',
]);
const pipelineKindSchema = z.enum(['experiment', 'clean_result', 'todo', 'idea', 'automation']);

type PipelineStage = z.infer<typeof pipelineStageSchema>;
type PipelineKind = z.infer<typeof pipelineKindSchema>;
type AgentRunKind = 'plan' | 'apply' | 'qa' | 'experiment';
type AgentRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'deploying'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled';

const advanceSchema = z.object({
  id: z.string().uuid(),
  kind: pipelineKindSchema,
  fromStage: pipelineStageSchema.optional(),
  toStage: pipelineStageSchema,
});

const activeRunStatuses = ['queued', 'running', 'awaiting_approval', 'approved', 'deploying'] as const;

const experimentStatusByStage: Record<PipelineStage, ExperimentStatus> = {
  later: 'proposed',
  idea: 'proposed',
  clarifying: 'clarifying',
  awaiting_clarifications: 'awaiting_clarifications',
  planning: 'planning',
  approval: 'plan_pending',
  queued: 'queued',
  running: 'running',
  interpreting: 'interpreting',
  followups_running: 'followups_running',
  clean_results: 'interpreting',
  blocked: 'blocked',
  review: 'reviewing',
  done: 'completed',
  archived: 'archived',
};

const todoStatusByStage: Partial<Record<PipelineStage, (typeof todos.$inferSelect)['status']>> = {
  later: 'inbox',
  idea: 'open',
  planning: 'planning',
  running: 'running',
  interpreting: 'interpreting',
  clean_results: 'awaiting_promotion',
  blocked: 'blocked',
  review: 'awaiting_promotion',
  done: 'done',
  archived: 'archived',
};

function setPipelineStageOwnerNote(ownerNote: string | null | undefined, stage: PipelineStage) {
  const remaining = (ownerNote ?? '')
    .split('\n')
    .filter((line) => !line.trim().startsWith(PIPELINE_STAGE_NOTE_PREFIX))
    .join('\n')
    .trim();
  const marker = `${PIPELINE_STAGE_NOTE_PREFIX}${stage}`;
  return remaining ? `${marker}\n${remaining}` : marker;
}

const cleanResultStatusByStage: Partial<Record<PipelineStage, (typeof cleanResults.$inferSelect)['status']>> = {
  clean_results: 'reviewing',
  interpreting: 'draft',
  review: 'reviewing',
  done: 'approved',
  blocked: 'blocked',
  archived: 'archived',
};

const automationStatusByStage: Partial<Record<PipelineStage, AgentRunStatus>> = {
  approval: 'awaiting_approval',
  queued: 'queued',
  running: 'queued',
  done: 'completed',
  blocked: 'blocked',
  archived: 'cancelled',
};

function entityHref(kind: PipelineKind | EntityKind, id: string) {
  if (kind === 'clean_result') return `/clean-results/${id}`;
  if (kind === 'automation' || kind === 'run') return `/agent/${id}`;
  return `/e/${kind}/${id}`;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
}

function experimentMarker(number: number | null | undefined) {
  return typeof number === 'number' ? `#${number}` : null;
}

async function markerForExperimentId(experimentId: string | null | undefined) {
  if (!experimentId) return null;
  const rows = await db()
    .select({ number: experiments.number })
    .from(experiments)
    .where(eq(experiments.id, experimentId))
    .limit(1);
  return experimentMarker(rows[0]?.number);
}

function cardPayload(input: {
  key: string;
  id: string;
  kind: PipelineKind;
  stage: PipelineStage;
  marker?: string | null;
  title: string;
  detail?: string | null;
  status: string;
  project?: string | null;
  ownerAction?: string | null;
  createdAt?: Date | string | null;
  href?: string;
}) {
  return {
    key: input.key,
    id: input.id,
    kind: input.kind,
    stage: input.stage,
    marker: input.marker ?? null,
    title: input.title,
    detail: input.detail ?? null,
    status: input.status,
    project: input.project ?? null,
    ownerAction: input.ownerAction ?? null,
    createdAt: iso(input.createdAt),
    updatedAt: new Date().toISOString(),
    href: input.href ?? entityHref(input.kind, input.id),
    tone: statusTone(input.status),
  };
}

function agentStepFor(kind: PipelineKind, stage: PipelineStage): AgentRunKind | null {
  if (kind === 'experiment' || kind === 'idea') {
    if (stage === 'clarifying' || stage === 'planning' || stage === 'queued' || stage === 'running') return 'experiment';
    if (stage === 'interpreting' || stage === 'review') return 'qa';
  }
  if (kind === 'todo') {
    if (stage === 'planning') return 'plan';
    if (stage === 'running') return 'apply';
    if (stage === 'interpreting' || stage === 'review') return 'qa';
  }
  if (kind === 'clean_result') {
    if (stage === 'interpreting' || stage === 'review') return 'qa';
  }
  return null;
}

function agentRequest(input: {
  kind: PipelineKind;
  title: string;
  fromStage?: PipelineStage;
  toStage: PipelineStage;
}) {
  const movement = input.fromStage ? `Moved from ${input.fromStage} to ${input.toStage}` : `Moved to ${input.toStage}`;
  switch (input.kind) {
    case 'experiment':
    case 'idea':
      if (input.toStage === 'clarifying') {
        return `${movement} on the Pipeline board.\n\nClarify the scoped experiment before full planning. Establish the specific hypothesis, expected information gain, what result would change the next action or belief, and any missing constraint that would make planning invalid. Ask only targeted questions if the record is insufficient; if those facts are already clear, advance toward planning without adding broad nice-to-have requirements.`;
      }
      if (input.toStage === 'interpreting' || input.toStage === 'review') {
        return `${movement} on the Pipeline board.\n\nInterpret the current evidence for the scoped experiment. Use the scoped record as the source of truth for title and scope, identify missing artifacts or blockers, and produce the next concrete review note. Do not rename, retitle, or otherwise mutate the scoped issue/experiment.`;
      }
      return `${movement} on the Pipeline board.\n\nDraft the next experiment plan for the scoped experiment. Use the scoped experiment record as the source of truth for title and scope, and produce a plan that can be reviewed and approved. Do not rename, retitle, or otherwise mutate the scoped issue/experiment.`;
    case 'todo':
      if (input.toStage === 'running') {
        return `${movement} on the Pipeline board.\n\nAdvance this task now: "${input.title}". Use the scoped task context and make the smallest useful change or report the exact blocker.`;
      }
      return `${movement} on the Pipeline board.\n\nPlan or review the next step for this task: "${input.title}". Use the scoped task context and keep the result directly actionable.`;
    case 'clean_result':
      return `${movement} on the Pipeline board.\n\nReview this clean result: "${input.title}". Check the scoped record for support, caveats, missing artifacts, and the next owner decision.`;
    case 'automation':
      return `${movement} on the Pipeline board.\n\nContinue the automation run for "${input.title}".`;
  }
}

async function queueAgentRun(input: {
  kind: AgentRunKind;
  request: string;
  scopeEntityKind?: EntityKind;
  scopeEntityId?: string;
  actorUserId: string;
}) {
  if (input.scopeEntityKind && input.scopeEntityId) {
    // Dedup against same-kind in-flight runs only. A `plan` waiting on owner
    // approval must not block dispatching an `apply` when the owner moves the
    // card forward — otherwise the card silently lands in Running with no
    // implementer behind it (incident 2026-05-13, Tinker todo).
    const existing = await db()
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.scopeEntityKind, input.scopeEntityKind),
          eq(agentRuns.scopeEntityId, input.scopeEntityId),
          eq(agentRuns.kind, input.kind),
          inArray(agentRuns.status, [...activeRunStatuses]),
        ),
      )
      .orderBy(desc(agentRuns.updatedAt))
      .limit(1);
    if (existing[0]) return { runId: existing[0].id, existing: true };

    // If we're about to queue an `apply` while an earlier-stage `plan` (or
    // `experiment` planner for experiments/ideas) is still awaiting owner
    // approval, treat the forward move as implicit approval and finalize the
    // pending plan so it doesn't sit forever in the approvals queue.
    if (input.kind === 'apply' || input.kind === 'qa') {
      const supersededKinds = input.kind === 'apply'
        ? (input.scopeEntityKind === 'experiment' ? (['plan', 'experiment'] as const) : (['plan'] as const))
        : (['apply'] as const);
      await db()
        .update(agentRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
          lastError: 'Superseded by forward move on the Pipeline board.',
        })
        .where(
          and(
            eq(agentRuns.scopeEntityKind, input.scopeEntityKind),
            eq(agentRuns.scopeEntityId, input.scopeEntityId),
            inArray(agentRuns.kind, [...supersededKinds]),
            eq(agentRuns.status, 'awaiting_approval'),
          ),
        );
    }
  }

  // Auto-approve the planner output for orchestrator-spawned follow-up
  // children — they're queued by the parent's orchestrator on the owner's
  // behalf and shouldn't sit in awaiting_approval.
  let autoApprove = false;
  if (input.scopeEntityKind === 'experiment' && input.scopeEntityId) {
    const expRow = await db()
      .select({ autoApprovePlan: experiments.autoApprovePlan })
      .from(experiments)
      .where(eq(experiments.id, input.scopeEntityId))
      .limit(1);
    autoApprove = Boolean(expRow[0]?.autoApprovePlan);
  }

  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind: input.kind,
      provider: 'claude_code',
      status: 'queued',
      request: input.request,
      scopeEntityKind: input.scopeEntityKind,
      scopeEntityId: input.scopeEntityId,
      approvalRequired: (input.kind === 'plan' || input.kind === 'experiment') && !autoApprove,
    })
    .returning({ id: agentRuns.id });
  const runId = inserted[0]!.id;
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
  await appendDailyLogTrailBestEffort({
    action: `Queued ${input.kind} agent run ${runId.slice(0, 8)}`,
    why: input.request.slice(0, 500),
    entityKind: input.scopeEntityKind,
    entityId: input.scopeEntityId,
    actorKind: 'user',
    actorUserId: input.actorUserId,
    agentRunId: runId,
    correlationId: runId,
  });
  return { runId, existing: false };
}

async function approveLatestScopedRun(input: {
  scopeEntityKind: EntityKind;
  scopeEntityId: string;
  actorUserId: string;
  note: string;
}) {
  const pending = await db()
    .select({ id: agentRuns.id, kind: agentRuns.kind, request: agentRuns.request })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, input.scopeEntityKind),
        eq(agentRuns.scopeEntityId, input.scopeEntityId),
        eq(agentRuns.status, 'awaiting_approval'),
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  const run = pending[0];
  if (!run) return null;

  await db()
    .update(agentRuns)
    .set({
      status: 'approved',
      approvedBy: input.actorUserId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentRuns.id, run.id));
  await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${run.id})`);
  await appendDailyLogTrailBestEffort({
    action: `Approved ${run.kind} agent run ${run.id.slice(0, 8)}`,
    why: input.note,
    entityKind: input.scopeEntityKind,
    entityId: input.scopeEntityId,
    actorKind: 'user',
    actorUserId: input.actorUserId,
    agentRunId: run.id,
    correlationId: run.id,
    detail: run.request.slice(0, 500),
  });
  return run.id;
}

/**
 * Re-use the most recent existing plan for this experiment scope when the
 * owner moves the card to queued/running. Without this, every approval→queued
 * move triggers a fresh planning pass (the agent re-drafts from scratch)
 * because cancelled / completed agent_runs are invisible to
 * approveLatestScopedRun. If the experiment has a plan_md anywhere, copy it
 * into a new agent_run with status=approved and fire APPROVED_CHANNEL so the
 * dispatcher takes over — no re-planning.
 *
 * Excludes failed runs (their plan_md is suspect by definition).
 */
async function reuseLatestPlanIfAny(input: {
  scopeEntityKind: EntityKind;
  scopeEntityId: string;
  actorUserId: string;
  note: string;
}) {
  const rows = await db()
    .select({
      id: agentRuns.id,
      kind: agentRuns.kind,
      planMd: agentRuns.planMd,
      planJson: agentRuns.planJson,
      request: agentRuns.request,
      provider: agentRuns.provider,
      runpodAccount: agentRuns.runpodAccount,
      chatSessionId: agentRuns.chatSessionId,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.scopeEntityKind, input.scopeEntityKind),
        eq(agentRuns.scopeEntityId, input.scopeEntityId),
        eq(agentRuns.kind, 'experiment'),
        ne(agentRuns.status, 'failed'),
        sql`${agentRuns.planMd} IS NOT NULL AND length(${agentRuns.planMd}) > 0`,
      ),
    )
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  const source = rows[0];
  if (!source) return null;

  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind: 'experiment',
      provider: source.provider,
      status: 'approved',
      request: `[plan-reused-from:${source.id}]\n\nApproved an existing plan without re-drafting. Source agent_run preserved this experiment's plan_md before the owner moved the card to queued.`,
      planMd: source.planMd,
      planJson: source.planJson,
      scopeEntityKind: input.scopeEntityKind,
      scopeEntityId: input.scopeEntityId,
      runpodAccount: source.runpodAccount,
      chatSessionId: source.chatSessionId,
      approvalRequired: false,
      approvedBy: input.actorUserId,
      approvedAt: new Date(),
    })
    .returning({ id: agentRuns.id });
  const newRunId = inserted[0]!.id;

  await db().insert(agentRunEvents).values({
    runId: newRunId,
    eventType: 'plan_reused',
    body: source.id,
    metadata: { sourceRunId: source.id, actorUserId: input.actorUserId },
  });
  await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${newRunId})`);
  await appendDailyLogTrailBestEffort({
    action: `Re-used existing plan for ${input.scopeEntityKind} ${input.scopeEntityId.slice(0, 8)}`,
    why: input.note,
    entityKind: input.scopeEntityKind,
    entityId: input.scopeEntityId,
    actorKind: 'user',
    actorUserId: input.actorUserId,
    agentRunId: newRunId,
    correlationId: source.id,
    detail: `Skipped re-planning; copied plan_md from agent_run ${source.id.slice(0, 8)}.`,
  });
  return newRunId;
}

function unsupported(stage: PipelineStage, kind: PipelineKind) {
  return NextResponse.json(
    { error: 'unsupported_stage', message: `${kind.replace('_', ' ')} cards cannot move to ${stage}.` },
    { status: 400 },
  );
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = advanceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const input = parsed.data;
  const response =
    input.kind === 'experiment'
      ? await advanceExperiment(input, session.user.id)
      : input.kind === 'clean_result'
        ? await advanceCleanResult(input, session.user.id)
        : input.kind === 'todo'
          ? await advanceTodo(input, session.user.id)
          : input.kind === 'idea'
            ? await advanceIdea(input, session.user.id)
            : await advanceAutomation(input, session.user.id);
  if (response.ok) {
    // Broadcast so /pipeline subscribers refetch this card without a manual refresh.
    await notifyPipelineChanged(`${input.kind}:${input.id}:${input.toStage}`);
  }
  return response;
}

async function advanceExperiment(input: z.infer<typeof advanceSchema>, actorUserId: string) {
  const rows = await db()
    .select({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      hypothesis: experiments.hypothesis,
      status: experiments.status,
      priority: experiments.priority,
      createdAt: experiments.createdAt,
    })
    .from(experiments)
    .where(eq(experiments.id, input.id))
    .limit(1);
  const experiment = rows[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const status = experimentStatusByStage[input.toStage];
  const updated = await setExperimentStatus({
    experimentId: input.id,
    status,
    actorUserId,
    note: `Moved on Pipeline board to ${input.toStage}.`,
  });
  let nextStatus = updated?.status ?? status;
  const nextPriority = input.toStage === 'later' ? 'low' : experiment.priority === 'low' ? 'normal' : experiment.priority;
  if (nextPriority !== experiment.priority) {
    await db()
      .update(experiments)
      .set({ priority: nextPriority, updatedAt: new Date() })
      .where(eq(experiments.id, input.id));
  }

  let agentRunId: string | undefined;
  let message = `Moved to ${input.toStage}.`;
  if (input.toStage === 'queued' || input.toStage === 'running') {
    const approvedRun = await approveLatestScopedRun({
      scopeEntityKind: 'experiment',
      scopeEntityId: input.id,
      actorUserId,
      note: `Approved from Pipeline board after moving "${experiment.title}" to ${input.toStage}.`,
    });
    if (approvedRun) {
      agentRunId = approvedRun;
      message = 'Approved the waiting agent plan and notified the runner.';
      await setExperimentStatus({
        experimentId: input.id,
        status: 'approved',
        actorUserId,
        note: `Approved from Pipeline board after moving to ${input.toStage}.`,
      });
      nextStatus = 'approved';
    } else {
      // No awaiting_approval run for this scope. Before paying for a fresh
      // planning pass, see if any prior non-failed experiment-kind run on
      // this scope already produced a plan_md we can re-use. If so, the
      // plan IS done — copy it forward instead of re-drafting from scratch.
      const reusedRun = await reuseLatestPlanIfAny({
        scopeEntityKind: 'experiment',
        scopeEntityId: input.id,
        actorUserId,
        note: `Re-used existing plan after moving "${experiment.title}" to ${input.toStage}.`,
      });
      if (reusedRun) {
        agentRunId = reusedRun;
        message = 'Re-used the existing plan and notified the runner.';
        await setExperimentStatus({
          experimentId: input.id,
          status: 'approved',
          actorUserId,
          note: `Re-used existing plan after moving to ${input.toStage}.`,
        });
        nextStatus = 'approved';
      } else {
        const run = await queueAgentRun({
          kind: 'experiment',
          request: agentRequest({ kind: 'experiment', title: experiment.title, fromStage: input.fromStage, toStage: input.toStage }),
          scopeEntityKind: 'experiment',
          scopeEntityId: input.id,
          actorUserId,
        });
        agentRunId = run.runId;
        message = run.existing ? 'An agent run is already active for this experiment.' : 'Queued the next experiment agent step.';
      }
    }
  } else {
    const step = agentStepFor('experiment', input.toStage);
    if (step) {
      const run = await queueAgentRun({
        kind: step,
        request: agentRequest({ kind: 'experiment', title: experiment.title, fromStage: input.fromStage, toStage: input.toStage }),
        scopeEntityKind: 'experiment',
        scopeEntityId: input.id,
        actorUserId,
      });
      agentRunId = run.runId;
      message = run.existing ? 'An agent run is already active for this experiment.' : 'Queued the next experiment agent step.';
    }
  }

  return NextResponse.json({
    ok: true,
    agentRunId,
    message,
    card: cardPayload({
      key: `experiment-${input.id}`,
      id: input.id,
      kind: 'experiment',
      stage: input.toStage,
      marker: experimentMarker(experiment.number),
      title: experiment.title,
      detail: experiment.hypothesis,
      status: nextStatus,
      ownerAction: ['plan_pending', 'awaiting_approval', 'blocked', 'awaiting_promotion'].includes(nextStatus)
        ? experimentTurn(nextStatus)
        : null,
      createdAt: experiment.createdAt,
    }),
  });
}

async function advanceCleanResult(input: z.infer<typeof advanceSchema>, actorUserId: string) {
  const status = cleanResultStatusByStage[input.toStage];
  if (!status) return unsupported(input.toStage, 'clean_result');
  const rows = await db()
    .select({
      id: cleanResults.id,
      title: cleanResults.title,
      claim: cleanResults.claim,
      bodyMd: cleanResults.bodyMd,
      status: cleanResults.status,
      artifactStatus: cleanResults.artifactStatus,
      sourceDailyLogEntryId: cleanResults.sourceDailyLogEntryId,
      experimentId: cleanResults.experimentId,
      createdAt: cleanResults.createdAt,
    })
    .from(cleanResults)
    .where(eq(cleanResults.id, input.id))
    .limit(1);
  const result = rows[0];
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (status === 'approved' && result.artifactStatus !== 'verified') {
    return NextResponse.json(
      { error: 'verified_artifacts_required', message: 'Clean results need verified artifacts before they can move to done.' },
      { status: 409 },
    );
  }

  const updates: Partial<typeof cleanResults.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };
  if (status === 'approved') {
    updates.approvedBy = actorUserId;
    updates.approvedAt = new Date();
  }
  await db().update(cleanResults).set(updates).where(eq(cleanResults.id, input.id));

  if (status === 'approved' && !result.sourceDailyLogEntryId) {
    const entry = await db()
      .insert(dailyLogEntries)
      .values({
        day: new Date().toISOString().slice(0, 10),
        kind: 'clean_result',
        bodyMd: result.bodyMd,
        entityKind: 'clean_result',
        entityId: result.id,
      })
      .returning({ id: dailyLogEntries.id });
    await db()
      .update(cleanResults)
      .set({ sourceDailyLogEntryId: entry[0]!.id, updatedAt: new Date() })
      .where(eq(cleanResults.id, input.id));
  }

  let agentRunId: string | undefined;
  let message = `Moved to ${input.toStage}.`;
  const step = agentStepFor('clean_result', input.toStage);
  if (step) {
    const run = await queueAgentRun({
      kind: step,
      request: agentRequest({ kind: 'clean_result', title: result.title, fromStage: input.fromStage, toStage: input.toStage }),
      scopeEntityKind: 'clean_result',
      scopeEntityId: input.id,
      actorUserId,
    });
    agentRunId = run.runId;
    message = run.existing ? 'An agent run is already active for this clean result.' : 'Queued the next review agent step.';
  }

  await appendDailyLogTrailBestEffort({
    action: `Moved clean result ${result.title.slice(0, 80)} to ${input.toStage}`,
    why: `Pipeline board drag updated clean-result status to ${status}.`,
    entityKind: 'clean_result',
    entityId: input.id,
    actorKind: 'user',
    actorUserId,
    correlationId: input.id,
  });

  return NextResponse.json({
    ok: true,
    agentRunId,
    message,
    card: cardPayload({
      key: `clean-result-${input.id}`,
      id: input.id,
      kind: 'clean_result',
      stage: input.toStage,
      marker: await markerForExperimentId(result.experimentId),
      title: result.title,
      detail: result.claim,
      status,
      ownerAction: ['reviewing', 'blocked'].includes(status) ? 'Owner turn: review clean result' : null,
      createdAt: result.createdAt,
    }),
  });
}

async function advanceTodo(input: z.infer<typeof advanceSchema>, actorUserId: string) {
  const status = todoStatusByStage[input.toStage];
  if (!status) return unsupported(input.toStage, 'todo');
  const rows = await db()
    .select({
      id: todos.id,
      text: todos.text,
      bodyMd: todos.bodyMd,
      priority: todos.priority,
      ownerNote: todos.ownerNote,
      linkedKind: todos.linkedKind,
      linkedId: todos.linkedId,
      createdAt: todos.createdAt,
    })
    .from(todos)
    .where(eq(todos.id, input.id))
    .limit(1);
  const todo = rows[0];
  if (!todo) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const nextPriority = input.toStage === 'later' ? 'low' : todo.priority === 'low' ? 'normal' : todo.priority;
  await db()
    .update(todos)
    .set({ status, priority: nextPriority, ownerNote: setPipelineStageOwnerNote(todo.ownerNote, input.toStage), updatedAt: new Date() })
    .where(eq(todos.id, input.id));

  let agentRunId: string | undefined;
  let message = `Moved to ${input.toStage}.`;
  const step = agentStepFor('todo', input.toStage);
  if (step) {
    const run = await queueAgentRun({
      kind: step,
      request: agentRequest({ kind: 'todo', title: todo.text, fromStage: input.fromStage, toStage: input.toStage }),
      scopeEntityKind: 'todo',
      scopeEntityId: input.id,
      actorUserId,
    });
    agentRunId = run.runId;
    message = run.existing ? 'An agent run is already active for this task.' : 'Queued the next task agent step.';
  }

  await appendDailyLogTrailBestEffort({
    action: `Moved task ${todo.text.slice(0, 80)} to ${input.toStage}`,
    why: `Pipeline board drag updated task status to ${status}.`,
    entityKind: 'todo',
    entityId: input.id,
    actorKind: 'user',
    actorUserId,
    correlationId: input.id,
  });

  return NextResponse.json({
    ok: true,
    agentRunId,
    message,
    card: cardPayload({
      key: `todo-${input.id}`,
      id: input.id,
      kind: 'todo',
      stage: input.toStage,
      marker: todo.linkedKind === 'experiment' ? await markerForExperimentId(todo.linkedId) : null,
      title: todo.text,
      detail: todo.bodyMd,
      status,
      ownerAction: nextPriority === 'urgent' || status === 'blocked' ? `Owner turn: ${nextPriority} task` : null,
      createdAt: todo.createdAt,
      href: entityHref('todo', input.id),
    }),
  });
}

async function advanceIdea(input: z.infer<typeof advanceSchema>, actorUserId: string) {
  if (input.toStage !== 'clarifying' && input.toStage !== 'planning' && input.toStage !== 'archived') return unsupported(input.toStage, 'idea');
  const rows = await db().select().from(ideaCards).where(eq(ideaCards.id, input.id)).limit(1);
  const idea = rows[0];
  if (!idea) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (input.toStage === 'archived') {
    await db()
      .update(ideaCards)
      .set({ state: 'archived', updatedAt: new Date() })
      .where(eq(ideaCards.id, input.id));
    return NextResponse.json({
      ok: true,
      message: 'Moved to archived.',
      card: cardPayload({
        key: `idea-${idea.id}`,
        id: idea.id,
        kind: 'idea',
        stage: 'archived',
        title: idea.title,
        detail: idea.bodyMd,
        status: 'archived',
        createdAt: idea.createdAt,
        href: `/ideation/${idea.sessionId}#idea-${idea.id}`,
      }),
    });
  }
  if (idea.state === 'promoted' && idea.promotedKind && idea.promotedId) {
    return NextResponse.json(
      { error: 'already_promoted', message: 'This idea has already been promoted.' },
      { status: 409 },
    );
  }

  const inserted = await db()
    .insert(experiments)
    .values({
      title: idea.title.slice(0, 300),
      hypothesis: idea.bodyMd,
      status: input.toStage === 'clarifying' ? 'clarifying' : 'planning',
      planJson: {
        createdFrom: 'idea_card',
        ideaCardId: idea.id,
        ideationSessionId: idea.sessionId,
      },
    })
    .returning({
      id: experiments.id,
      number: experiments.number,
      title: experiments.title,
      hypothesis: experiments.hypothesis,
      status: experiments.status,
      createdAt: experiments.createdAt,
    });
  const experiment = inserted[0]!;
  await db()
    .update(ideaCards)
    .set({
      state: 'promoted',
      promotionKind: 'experiment',
      promotedKind: 'experiment',
      promotedId: experiment.id,
      updatedAt: new Date(),
    })
    .where(eq(ideaCards.id, idea.id));
  await appendWorkflowEvent({
    entityKind: 'experiment',
    entityId: experiment.id,
    eventType: 'created',
    toStatus: experiment.status,
    actorKind: 'user',
    actorUserId,
    note: 'Experiment promoted from Pipeline board drag.',
    metadata: { ideaCardId: idea.id, ideationSessionId: idea.sessionId, turn: experimentTurn(experiment.status) },
  });

  const run = await queueAgentRun({
    kind: 'experiment',
    request: agentRequest({ kind: 'idea', title: idea.title, fromStage: input.fromStage, toStage: input.toStage }),
    scopeEntityKind: 'experiment',
    scopeEntityId: experiment.id,
    actorUserId,
  });

  return NextResponse.json({
    ok: true,
    agentRunId: run.runId,
    message: run.existing ? 'The promoted experiment already has an active agent run.' : 'Promoted the idea and queued an experiment plan.',
    card: cardPayload({
      key: `experiment-${experiment.id}`,
      id: experiment.id,
      kind: 'experiment',
      stage: input.toStage,
      marker: experimentMarker(experiment.number),
      title: experiment.title,
      detail: experiment.hypothesis,
      status: experiment.status,
      ownerAction: experimentTurn(experiment.status),
      createdAt: experiment.createdAt,
      href: entityHref('experiment', experiment.id),
    }),
    removeKey: `idea-${idea.id}`,
  });
}

async function advanceAutomation(input: z.infer<typeof advanceSchema>, actorUserId: string) {
  const targetStatus = automationStatusByStage[input.toStage];
  if (!targetStatus) return unsupported(input.toStage, 'automation');
  const rows = await db()
    .select({
      id: agentRuns.id,
      kind: agentRuns.kind,
      request: agentRuns.request,
      status: agentRuns.status,
      scopeEntityKind: agentRuns.scopeEntityKind,
      scopeEntityId: agentRuns.scopeEntityId,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.id, input.id))
    .limit(1);
  const run = rows[0];
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let nextStatus: AgentRunStatus = targetStatus;
  let agentRunId: string | undefined = run.id;
  let message = `Moved automation to ${input.toStage}.`;
  if ((input.toStage === 'queued' || input.toStage === 'running') && run.status === 'awaiting_approval') {
    await db()
      .update(agentRuns)
      .set({ status: 'approved', approvedBy: actorUserId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentRuns.id, run.id));
    await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${run.id})`);
    nextStatus = 'approved';
    message = 'Approved the waiting automation plan and notified the runner.';
  } else {
    const updates: Partial<typeof agentRuns.$inferInsert> = {
      status: targetStatus,
      updatedAt: new Date(),
    };
    if (targetStatus === 'completed') updates.completedAt = new Date();
    await db().update(agentRuns).set(updates).where(eq(agentRuns.id, run.id));
    if (targetStatus === 'queued') {
      await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${run.id})`);
      message = 'Requeued the automation run.';
    }
  }

  await appendDailyLogTrailBestEffort({
    action: `Moved automation run ${run.id.slice(0, 8)} to ${input.toStage}`,
    why: `Pipeline board drag updated agent-run status to ${nextStatus}.`,
    entityKind: run.scopeEntityKind ?? undefined,
    entityId: run.scopeEntityId ?? undefined,
    actorKind: 'user',
    actorUserId,
    agentRunId: run.id,
    correlationId: run.id,
  });

  return NextResponse.json({
    ok: true,
    agentRunId,
    message,
    card: cardPayload({
      key: `agent-${run.id}`,
      id: run.id,
      kind: 'automation',
      stage: input.toStage === 'running' ? 'queued' : input.toStage,
      marker: run.scopeEntityKind === 'experiment' ? await markerForExperimentId(run.scopeEntityId) : null,
      title: run.request,
      detail: run.scopeEntityKind && run.scopeEntityId ? `${run.scopeEntityKind} ${run.scopeEntityId.slice(0, 8)}` : run.kind,
      status: nextStatus,
      ownerAction: nextStatus === 'awaiting_approval' ? 'Owner turn: approve automation run' : null,
      createdAt: run.createdAt,
      href: entityHref('automation', run.id),
    }),
  });
}
