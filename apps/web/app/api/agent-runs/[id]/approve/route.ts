import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { agentRuns } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const APPROVED_CHANNEL = 'agent_run_approved';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const updated = await db()
    .update(agentRuns)
    .set({
      status: 'approved',
      approvedBy: session.user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(agentRuns.id, id), eq(agentRuns.status, 'awaiting_approval')))
    .returning({ id: agentRuns.id, kind: agentRuns.kind });
  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_awaiting_approval' }, { status: 409 });
  }
  await db().execute(sql`SELECT pg_notify(${APPROVED_CHANNEL}, ${id})`);
  return NextResponse.json({ ok: true });
}
