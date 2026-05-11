import { NextResponse } from 'next/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { agentRunEvents, agentRuns, podLifecycle } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';

const STOP_CHANNEL = 'runpod_stop_requested';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rows = await db()
    .select({ id: podLifecycle.id })
    .from(podLifecycle)
    .where(
      and(
        eq(podLifecycle.agentRunId, id),
        inArray(podLifecycle.status, ['deploying', 'running', 'retrying']),
      ),
    )
    .limit(20);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'no_active_pods' }, { status: 409 });
  }

  await db()
    .update(podLifecycle)
    .set({ status: 'stop_requested', updatedAt: new Date() })
    .where(
      and(
        eq(podLifecycle.agentRunId, id),
        inArray(podLifecycle.status, ['deploying', 'running', 'retrying']),
      ),
    );
  await db()
    .update(agentRuns)
    .set({ runpodStatus: 'stop_requested', updatedAt: new Date() })
    .where(eq(agentRuns.id, id));
  await db().insert(agentRunEvents).values({
    runId: id,
    eventType: 'runpod_stop_requested',
    body: 'Owner requested RunPod stop. Stop preserves the attached volume.',
    metadata: { podCount: rows.length },
  });
  await db().execute(sql`SELECT pg_notify(${STOP_CHANNEL}, ${id})`);
  return NextResponse.json({ ok: true, podCount: rows.length });
}
