import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents } from '@eps/db/schema';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await ctx.params;

  const runRows = await db().select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  const run = runRows[0];
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const events = await db()
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, id))
    .orderBy(agentRunEvents.createdAt);

  return NextResponse.json({ run, events });
}
