import { and, eq } from 'drizzle-orm';
import { approvalRequests, experiments, workflowEvents } from '@sagan/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';

export const EXPERIMENT_STATUSES = [
  'proposed',
  'clarifying',
  'gate_pending',
  'planning',
  'plan_pending',
  'approved',
  'awaiting_approval',
  'queued',
  'implementing',
  'code_reviewing',
  'testing',
  'running',
  'uploading',
  'verifying',
  'interpreting',
  'reviewing',
  'awaiting_promotion',
  'followups_running',
  'shared',
  'blocked',
  'completed',
  'done_experiment',
  'done_impl',
  'failed',
  'cancelled',
  'archived',
] as const;

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];
type WorkflowEventInsert = typeof workflowEvents.$inferInsert;

export function experimentTurn(status: string) {
  switch (status) {
    case 'proposed':
      return 'Sagan turn: clarify scope';
    case 'clarifying':
      return 'Sagan turn: clarify hypothesis and information gain';
    case 'gate_pending':
      return 'Owner turn: resolve gate';
    case 'planning':
      return 'Sagan turn: draft plan';
    case 'plan_pending':
    case 'awaiting_approval':
      return 'Owner turn: approve, defer, or reject';
    case 'approved':
    case 'queued':
    case 'implementing':
    case 'code_reviewing':
    case 'testing':
    case 'running':
    case 'uploading':
    case 'verifying':
    case 'interpreting':
    case 'reviewing':
    case 'followups_running':
      return 'Sagan turn: run and verify';
    case 'awaiting_promotion':
      return 'Owner turn: review clean result';
    case 'blocked':
      return 'Owner turn: unblock or revise';
    default:
      return 'No active owner action';
  }
}

export async function appendWorkflowEvent(input: {
  entityKind: EntityKind;
  entityId: string;
  eventType: WorkflowEventInsert['eventType'];
  fromStatus?: string | null;
  toStatus?: string | null;
  actorKind?: string;
  actorUserId?: string;
  note?: string;
  metadata?: Record<string, unknown>;
}) {
  const inserted = await db()
    .insert(workflowEvents)
    .values({
      entityKind: input.entityKind,
      entityId: input.entityId,
      eventType: input.eventType,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorKind: input.actorKind ?? 'system',
      actorUserId: input.actorUserId,
      note: input.note,
      metadata: input.metadata,
    })
    .returning({ id: workflowEvents.id });
  return inserted[0]!;
}

export async function ensureExperimentPlanApprovalRequest(input: {
  experimentId: string;
  title: string;
  bodyMd?: string | null;
  requestedBy?: string;
}) {
  const existing = await db()
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.experimentId, input.experimentId),
        eq(approvalRequests.kind, 'experiment_plan'),
        eq(approvalRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const inserted = await db()
    .insert(approvalRequests)
    .values({
      kind: 'experiment_plan',
      status: 'pending',
      entityKind: 'experiment',
      entityId: input.experimentId,
      experimentId: input.experimentId,
      requestedBy: input.requestedBy,
      title: input.title,
      bodyMd: input.bodyMd,
      requestedState: 'plan_pending',
      approvedState: 'approved',
      rejectedState: 'planning',
    })
    .returning({ id: approvalRequests.id });
  await appendWorkflowEvent({
    entityKind: 'experiment',
    entityId: input.experimentId,
    eventType: 'approval_requested',
    toStatus: 'plan_pending',
    actorKind: input.requestedBy ? 'user' : 'system',
    actorUserId: input.requestedBy,
    note: 'Experiment plan approval requested.',
    metadata: { approvalRequestId: inserted[0]!.id },
  });
  return inserted[0]!;
}

export async function resolvePendingExperimentApprovalRequests(input: {
  experimentId: string;
  status: 'approved' | 'deferred' | 'rejected' | 'cancelled';
  resolvedBy?: string;
  note?: string;
}) {
  await db()
    .update(approvalRequests)
    .set({
      status: input.status,
      resolvedBy: input.resolvedBy,
      resolvedNote: input.note,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(approvalRequests.experimentId, input.experimentId),
        eq(approvalRequests.kind, 'experiment_plan'),
        eq(approvalRequests.status, 'pending'),
      ),
    );
}

export async function setExperimentStatus(input: {
  experimentId: string;
  status: ExperimentStatus;
  actorUserId?: string;
  note?: string;
}) {
  const current = await db()
    .select({ status: experiments.status, title: experiments.title, hypothesis: experiments.hypothesis })
    .from(experiments)
    .where(eq(experiments.id, input.experimentId))
    .limit(1);
  const row = current[0];
  if (!row) return null;

  const updated = await db()
    .update(experiments)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(experiments.id, input.experimentId))
    .returning({ id: experiments.id, title: experiments.title, status: experiments.status });
  const experiment = updated[0]!;

  if (row.status !== input.status) {
    await appendWorkflowEvent({
      entityKind: 'experiment',
      entityId: input.experimentId,
      eventType: input.status === 'blocked' ? 'blocked' : 'state_changed',
      fromStatus: row.status,
      toStatus: input.status,
      actorKind: input.actorUserId ? 'user' : 'system',
      actorUserId: input.actorUserId,
      note: input.note,
    });
  }

  if (input.status === 'plan_pending') {
    await ensureExperimentPlanApprovalRequest({
      experimentId: input.experimentId,
      title: `Approve experiment plan: ${row.title}`,
      bodyMd: row.hypothesis,
      requestedBy: input.actorUserId,
    });
  } else if (input.status === 'approved') {
    await resolvePendingExperimentApprovalRequests({
      experimentId: input.experimentId,
      status: 'approved',
      resolvedBy: input.actorUserId,
      note: input.note,
    });
  }

  return experiment;
}
