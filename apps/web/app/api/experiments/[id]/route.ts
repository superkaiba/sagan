import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { approvalRequests, experiments, runs, workflowEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { EXPERIMENT_STATUSES, experimentTurn, setExperimentStatus } from '@/lib/workflow';

const EXPERIMENT_KINDS = ['experiment', 'infra', 'survey'] as const;
const COMPUTE_SIZES = ['none', 'small', 'medium', 'large'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const ASSIGNEE_KINDS = ['agent', 'human'] as const;

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  body: z.string().max(200_000).optional(),
  hypothesis: z.string().max(50_000).optional(),
  configYaml: z.string().max(200_000).optional(),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
  kind: z.enum(EXPERIMENT_KINDS).optional(),
  computeSize: z.enum(COMPUTE_SIZES).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeKind: z.enum(ASSIGNEE_KINDS).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  hasCleanResult: z.boolean().optional(),
  runpodAccount: z.enum(['team', 'personal']).optional(),
  note: z.string().max(2_000).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await db().select().from(experiments).where(eq(experiments.id, id)).limit(1);
  const experiment = rows[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const [events, approvals] = await Promise.all([
    db()
      .select()
      .from(workflowEvents)
      .where(and(eq(workflowEvents.entityKind, 'experiment'), eq(workflowEvents.entityId, id)))
      .orderBy(desc(workflowEvents.createdAt))
      .limit(50),
    db()
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.experimentId, id))
      .orderBy(desc(approvalRequests.createdAt)),
  ]);
  return NextResponse.json({
    experiment: { ...experiment, turn: experimentTurn(experiment.status) },
    events,
    approvalRequests: approvals,
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const { status, note, ...metadataUpdates } = parsed.data;
  const updated = await db()
    .update(experiments)
    .set({ ...metadataUpdates, updatedAt: new Date() })
    .where(eq(experiments.id, id))
    .returning({ id: experiments.id, title: experiments.title, status: experiments.status });
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  let experiment = updated[0]!;

  // When a caller flips hasCleanResult=true, ensure there's a pending
  // runs row so the /promote endpoint has something to flip. The analyzer's
  // in-place promotion path (.claude/agents/analyzer.md Step 6) relies on
  // this — without it, promote would 409 with no_pending_run. Idempotent:
  // if a pending row already exists, we no-op.
  if (metadataUpdates.hasCleanResult === true) {
    const existingPending = await db()
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.experimentId, id), eq(runs.classification, 'pending')))
      .limit(1);
    if (existingPending.length === 0) {
      await db().insert(runs).values({ experimentId: id, classification: 'pending' });
    }
  }

  if (status) {
    const transitioned = await setExperimentStatus({
      experimentId: id,
      status,
      actorUserId: session.user.id,
      note,
    });
    if (transitioned) experiment = transitioned;
  }

  await appendDailyLogTrailBestEffort({
    action: `Updated experiment ${experiment.title.slice(0, 80)}`,
    why: 'A user edited experiment metadata through the web API.',
    entityKind: 'experiment',
    entityId: id,
    detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });

  return NextResponse.json({ ok: true, experiment: { ...experiment, turn: experimentTurn(experiment.status) } });
}
