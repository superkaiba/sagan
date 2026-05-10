import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { agentRuns } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
    .returning({ id: agentRuns.id });
  if (updated.length === 0) {
    return NextResponse.json({ error: 'not_awaiting_approval' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
