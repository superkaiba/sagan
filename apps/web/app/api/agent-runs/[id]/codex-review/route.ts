import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

function truncate(s: string | null | undefined, n: number) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const runRows = await db().select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  const run = runRows[0];
  if (!run) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const events = await db()
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, id))
    .orderBy(agentRunEvents.createdAt)
    .limit(80);

  const prompt = `Review this Claude Code run as Codex.

Focus on bugs, missed requirements, unsafe assumptions, and whether the run actually reached the user's requested final state. If it did not, provide a continuation plan.

Run:
- id: ${run.id}
- kind: ${run.kind}
- status: ${run.status}
- request: ${run.request}
- lastError: ${run.lastError ?? '(none)'}

Plan:
${run.planMd ?? '(none)'}

Events:
${events
  .map((event) => `- ${event.createdAt.toISOString()} ${event.eventType}: ${truncate(event.body, 800)}`)
  .join('\n')}`;

  await appendDailyLogTrailBestEffort({
    action: `Prepared Codex review prompt for run ${id.slice(0, 8)}`,
    why: 'Review Claude Code output with a separate reviewer before trusting or continuing the result.',
    entityKind: run.scopeEntityKind ?? undefined,
    entityId: run.scopeEntityId ?? undefined,
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: id,
    correlationId: id,
  });

  return NextResponse.json({ prompt });
}
