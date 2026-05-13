import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { agentRunEvents, agentRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import {
  appendWorkflowEvent,
  resolvePendingExperimentApprovalRequests,
  setExperimentStatus,
} from '@/lib/workflow';

const rejectSchema = z.object({ note: z.string().max(2_000).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const { id } = await ctx.params;
  const updated = await db()
    .update(agentRuns)
    .set({
      status: 'rejected',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(agentRuns.id, id), eq(agentRuns.status, 'awaiting_approval')))
    .returning({
      id: agentRuns.id,
      kind: agentRuns.kind,
      request: agentRuns.request,
      scopeEntityKind: agentRuns.scopeEntityKind,
      scopeEntityId: agentRuns.scopeEntityId,
    });
  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_awaiting_approval' }, { status: 409 });
  }
  const run = updated[0]!;
  await db().insert(agentRunEvents).values({
    runId: id,
    eventType: 'rejected',
    body: parsed.data.note ?? 'Owner rejected the plan.',
    metadata: { actorUserId: session.user.id },
  });
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    await setExperimentStatus({
      experimentId: run.scopeEntityId,
      status: 'planning',
      actorUserId: session.user.id,
      note: parsed.data.note ?? 'Owner rejected the experiment plan from the agent run.',
    });
    await resolvePendingExperimentApprovalRequests({
      experimentId: run.scopeEntityId,
      status: 'rejected',
      resolvedBy: session.user.id,
      note: parsed.data.note,
    });
    await appendWorkflowEvent({
      entityKind: 'experiment',
      entityId: run.scopeEntityId,
      eventType: 'rejected',
      actorKind: 'user',
      actorUserId: session.user.id,
      note: parsed.data.note ?? 'Experiment plan rejected.',
      metadata: { agentRunId: id },
    });
  }
  await appendDailyLogTrailBestEffort({
    action: `Rejected ${run.kind} agent run ${id.slice(0, 8)}`,
    why: `The proposed plan was not accepted for: ${run.request.slice(0, 400)}`,
    entityKind: run.scopeEntityKind ?? undefined,
    entityId: run.scopeEntityId ?? undefined,
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: id,
    correlationId: id,
  });
  return NextResponse.json({ ok: true });
}
