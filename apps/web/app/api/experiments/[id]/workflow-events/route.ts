import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendWorkflowEvent } from '@/lib/workflow';
import { validateReviewerLoopEvent } from '@/lib/reviewer-loops';

const WORKFLOW_EVENT_TYPES = [
  'created',
  'state_changed',
  'approval_requested',
  'approved',
  'deferred',
  'rejected',
  'blocked',
  'note',
] as const;

const postSchema = z.object({
  eventType: z.enum(WORKFLOW_EVENT_TYPES).default('note'),
  markerType: z.string().min(1).max(120).optional(),
  fromStatus: z.string().max(50).nullable().optional(),
  toStatus: z.string().max(50).nullable().optional(),
  note: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  actorKind: z.string().max(40).default('agent'),
});

/**
 * POST /api/experiments/:id/workflow-events
 *
 * Append a workflow event for an experiment. Used by the `/issue` skill on the
 * VM to record checkpoints in the agent pipeline (planner output, reviewer
 * verdict, interpretation critique, etc).
 *
 * For marker-style events, pass `markerType: "epm:plan"` (or similar) — the
 * marker name is stored in `metadata.marker_type` so consumers can scan the
 * latest event to decide where to resume.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const exists = await db()
    .select({ id: experiments.id })
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);
  if (!exists[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { eventType, markerType, fromStatus, toStatus, note, metadata: meta, actorKind } = parsed.data;
  const combinedMetadata = markerType
    ? { ...(meta ?? {}), marker_type: markerType }
    : meta;
  const reviewerLoop = validateReviewerLoopEvent({
    markerType,
    metadata: combinedMetadata,
    toStatus: toStatus ?? null,
  });
  if (!reviewerLoop.ok) {
    return NextResponse.json(
      { error: reviewerLoop.error, message: reviewerLoop.message },
      { status: 400 },
    );
  }

  const event = await appendWorkflowEvent({
    entityKind: 'experiment',
    entityId: id,
    eventType,
    fromStatus: fromStatus ?? null,
    toStatus: toStatus ?? null,
    actorKind,
    actorUserId: session.user.id,
    note,
    metadata: reviewerLoop.metadata,
  });

  return NextResponse.json({ ok: true, id: event.id });
}
