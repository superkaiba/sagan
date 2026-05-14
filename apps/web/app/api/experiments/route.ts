import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { entityKindSchema } from '@sagan/api';
import { entityMemberships, experiments, users } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { ForbiddenError, isOwner, requireEntityRead, requireOwner } from '@/lib/access';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { grantDefaultMentorMembership } from '@/lib/default-memberships';
import { notifyUsers } from '@/lib/notifications';
import {
  appendWorkflowEvent,
  EXPERIMENT_STATUSES,
  experimentTurn,
  setExperimentStatus,
} from '@/lib/workflow';

const createSchema = z.object({
  title: z.string().min(1).max(300),
  hypothesis: z.string().max(50_000).optional(),
  projectId: z.string().uuid().optional(),
  beliefId: z.string().uuid().optional(),
  runpodAccount: z.enum(['team', 'personal']).default('personal'),
  status: z.enum(EXPERIMENT_STATUSES).default('proposed'),
  sourceKind: entityKindSchema.optional(),
  sourceId: z.string().uuid().optional(),
  parentExperimentId: z.string().uuid().optional(),
  autoApprovePlan: z.boolean().default(false),
  body: z.string().max(200_000).optional(),
  tags: z.array(z.string()).max(20).optional(),
});

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  status: z.enum(EXPERIMENT_STATUSES).optional(),
});

export async function GET(req: Request) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const filters = parsed.data.status ? [eq(experiments.status, parsed.data.status)] : [];
  let query = db().select().from(experiments).$dynamic();
  if (filters.length) query = query.where(and(...filters));
  const rows = await query.orderBy(desc(experiments.updatedAt)).limit(parsed.data.limit);
  return NextResponse.json({
    experiments: rows.map((row) => ({ ...row, turn: experimentTurn(row.status) })),
  });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const owner = isOwner(session);
  if (!owner) {
    if (!parsed.data.sourceKind || !parsed.data.sourceId) {
      return NextResponse.json({ error: 'source_scope_required' }, { status: 403 });
    }
    try {
      await requireEntityRead(session, parsed.data.sourceKind, parsed.data.sourceId);
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  const inserted = await db()
    .insert(experiments)
    .values({
      title: parsed.data.title,
      hypothesis: parsed.data.hypothesis,
      projectId: owner
        ? parsed.data.projectId
        : parsed.data.sourceKind === 'project'
          ? parsed.data.sourceId
          : undefined,
      beliefId: owner
        ? parsed.data.beliefId
        : parsed.data.sourceKind === 'belief'
          ? parsed.data.sourceId
          : undefined,
      runpodAccount: parsed.data.runpodAccount,
      status: owner ? parsed.data.status : 'proposed',
      body: parsed.data.body,
      tags: parsed.data.tags ?? [],
      parentExperimentId: owner ? parsed.data.parentExperimentId : undefined,
      autoApprovePlan: owner ? parsed.data.autoApprovePlan : false,
      planJson: {
        createdFrom: owner ? 'sagan_experiment_proposal_api' : 'collaborator_experiment_proposal_api',
        proposedByUserId: session.user.id,
        proposedByRole: session.user.role,
        sourceKind: parsed.data.sourceKind,
        sourceId: parsed.data.sourceId,
        turn: experimentTurn(owner ? parsed.data.status : 'proposed'),
      },
    })
    .returning();
  const experiment = inserted[0]!;

  if (!owner) {
    await db()
      .insert(entityMemberships)
      .values({
        userId: session.user.id,
        entityKind: 'experiment',
        entityId: experiment.id,
        role: 'collaborator',
        createdBy: session.user.id,
      })
      .onConflictDoUpdate({
        target: [entityMemberships.userId, entityMemberships.entityKind, entityMemberships.entityId],
        set: { role: 'collaborator', updatedAt: new Date() },
      });
  }

  await grantDefaultMentorMembership('experiment', experiment.id, session.user.id);

  await appendWorkflowEvent({
    entityKind: 'experiment',
    entityId: experiment.id,
    eventType: 'created',
    toStatus: experiment.status,
    actorKind: 'user',
    actorUserId: session.user.id,
    note: owner ? 'Experiment proposal created in Sagan.' : 'Experiment proposal created by a scoped collaborator.',
    metadata: {
      turn: experimentTurn(experiment.status),
      proposedByRole: session.user.role,
      sourceKind: parsed.data.sourceKind,
      sourceId: parsed.data.sourceId,
    },
  });

  if (experiment.status === 'plan_pending') {
    await setExperimentStatus({
      experimentId: experiment.id,
      status: 'plan_pending',
      actorUserId: session.user.id,
      note: 'Experiment was created directly in plan-pending state.',
    });
  }

  await appendDailyLogTrailBestEffort({
    action: `Created experiment proposal ${experiment.title.slice(0, 80)}`,
    why: owner
      ? 'A user proposed an experiment in Sagan so it can enter the workflow state machine.'
      : 'A scoped collaborator proposed an experiment for owner review.',
    entityKind: 'experiment',
    entityId: experiment.id,
    detail: experiment.hypothesis?.slice(0, 500),
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: experiment.id,
  });

  if (!owner) {
    const ownerRows = await db().select({ id: users.id }).from(users).where(eq(users.role, 'owner'));
    await notifyUsers({
      userIds: ownerRows.map((row) => row.id),
      actorUserId: session.user.id,
      kind: 'system',
      title: 'Collaborator proposed an experiment',
      body: experiment.title,
      entityKind: 'experiment',
      entityId: experiment.id,
    });
  }

  return NextResponse.json({ experiment: { ...experiment, turn: experimentTurn(experiment.status) } });
}
