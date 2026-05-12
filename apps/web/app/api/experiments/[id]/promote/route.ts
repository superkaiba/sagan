import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { experiments, runs } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendWorkflowEvent, setExperimentStatus } from '@/lib/workflow';

const promoteSchema = z.object({
  verdict: z.enum(['useful', 'not_useful']),
  note: z.string().max(2_000).optional(),
});

/**
 * POST /api/experiments/:id/promote
 *
 * Clean-result promotion: atomically flip the experiment's latest pending
 * run's classification to the chosen verdict, set has_clean_result=true,
 * advance status to 'completed', and write a `epm:promoted` workflow event.
 *
 * Refuses to promote unless a runs row exists with classification='pending'
 * — the "awaiting promotion" gate. The analyzer creates the pending run
 * row when it creates the clean-result body; this endpoint flips it.
 *
 * Called by `python scripts/sagan_state.py promote <N> useful|not-useful`
 * on the VM, and by the dashboard's Promote button. Both routes share
 * this endpoint so the behavior stays identical.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = promoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }
  const { verdict, note } = parsed.data;

  const expRow = await db().select().from(experiments).where(eq(experiments.id, id)).limit(1);
  const experiment = expRow[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // Find the latest pending run for this experiment. The analyzer creates
  // exactly one pending run row when it posts the clean-result. If there
  // are 0 or 2+, surface the ambiguity rather than guess.
  const pendingRuns = await db()
    .select()
    .from(runs)
    .where(and(eq(runs.experimentId, id), eq(runs.classification, 'pending')))
    .orderBy(desc(runs.createdAt));

  if (pendingRuns.length === 0) {
    return NextResponse.json(
      {
        error: 'no_pending_run',
        detail:
          'Cannot promote: no runs row with classification=pending exists for this experiment. ' +
          'The analyzer must create one when posting the clean-result body.',
      },
      { status: 409 },
    );
  }
  if (pendingRuns.length > 1) {
    return NextResponse.json(
      {
        error: 'ambiguous_pending_runs',
        detail: `Multiple (${pendingRuns.length}) pending runs found. Resolve manually in the dashboard before promoting.`,
        runIds: pendingRuns.map((r) => r.id),
      },
      { status: 409 },
    );
  }
  const targetRun = pendingRuns[0]!;

  // Atomic in a single Drizzle transaction so a mid-flight failure
  // doesn't leave the experiment half-promoted.
  await db().transaction(async (tx) => {
    await tx
      .update(runs)
      .set({ classification: verdict, updatedAt: new Date() })
      .where(eq(runs.id, targetRun.id));

    await tx
      .update(experiments)
      .set({ hasCleanResult: true, updatedAt: new Date() })
      .where(eq(experiments.id, id));

    await appendWorkflowEvent({
      entityKind: 'experiment',
      entityId: id,
      eventType: 'note',
      actorKind: 'user',
      actorUserId: session.user.id,
      note: note ?? `Promoted as ${verdict.replace('_', '-')}`,
      metadata: { marker_type: 'epm:promoted', verdict, run_id: targetRun.id },
    });
  });

  // Status transition runs outside the inline tx because setExperimentStatus
  // posts its own state_changed workflow event.
  await setExperimentStatus({
    experimentId: id,
    status: 'completed',
    actorUserId: session.user.id,
    note: `Promoted as ${verdict.replace('_', '-')}`,
  });

  return NextResponse.json({
    ok: true,
    experiment: { id, status: 'completed', hasCleanResult: true },
    run: { id: targetRun.id, classification: verdict },
  });
}
