import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { approvalRequests, experiments, workflowEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { experimentTurn } from '@/lib/workflow';

/**
 * GET /api/experiments/by-number/:n
 *
 * Look up an experiment by its short integer `number` (the EPS-issue-number-style
 * identifier used in CLI tools like `/issue <N>`). Returns the experiment row
 * plus the most recent 50 workflow events and any open approval requests.
 *
 * Mirrors the shape of GET /api/experiments/:id so callers can swap based on
 * which identifier they have.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ n: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { n: nRaw } = await ctx.params;
  const n = Number.parseInt(nRaw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return NextResponse.json({ error: 'invalid_number' }, { status: 400 });
  }
  const rows = await db().select().from(experiments).where(eq(experiments.number, n)).limit(1);
  const experiment = rows[0];
  if (!experiment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [events, approvals] = await Promise.all([
    db()
      .select()
      .from(workflowEvents)
      .where(and(eq(workflowEvents.entityKind, 'experiment'), eq(workflowEvents.entityId, experiment.id)))
      .orderBy(desc(workflowEvents.createdAt))
      .limit(50),
    db()
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.experimentId, experiment.id))
      .orderBy(desc(approvalRequests.createdAt)),
  ]);

  return NextResponse.json({
    experiment: { ...experiment, turn: experimentTurn(experiment.status) },
    events,
    approvalRequests: approvals,
  });
}
