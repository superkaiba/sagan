import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

function truncate(s: string | null | undefined, n: number) {
  if (!s) return '';
  return s.length > n ? `${s.slice(0, n)}...` : s;
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  // Canonical plan_md lives on experiments for experiment-scoped runs.
  let planMd: string | null = run.planMd ?? null;
  if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
    const expRows = await db()
      .select({ planMd: experiments.planMd })
      .from(experiments)
      .where(eq(experiments.id, run.scopeEntityId))
      .limit(1);
    const expPlanMd = expRows[0]?.planMd ?? null;
    if (expPlanMd && expPlanMd.length > 0) planMd = expPlanMd;
  }

  const prompt = `Review this Claude Code run as Codex.

Focus on bugs, missed requirements, unsafe assumptions, and whether the run actually reached the user's requested final state. Classify each finding as blocker, important, follow-up, or nit.

Use this scope discipline:
- Blocker: the requested final state was not reached, the result is unsafe to trust, or there is a likely regression.
- Important: cheap, scope-preserving work that materially improves correctness.
- Follow-up: scope-expanding ideas, extra gates, additional diagnostics, or broader redesigns that are not required to satisfy this run.
- Nit: wording or style issues that should not block.

Do not turn ordinary caveats into new approval gates. If a diagnostic is already reported and the remaining concern can be handled during interpretation, list it as follow-up rather than a blocker. If the run did not reach the user's requested final state, provide a minimal continuation plan that addresses only blockers and cheap, scope-preserving important items.

Run:
- id: ${run.id}
- kind: ${run.kind}
- status: ${run.status}
- request: ${run.request}
- lastError: ${run.lastError ?? '(none)'}

Plan:
${planMd ?? '(none)'}

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
