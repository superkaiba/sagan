import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { agentRuns, agentRunEvents } from '@eps/db/schema';
import { db } from '@/lib/db';
import { RunStream } from './RunStream';

export const dynamic = 'force-dynamic';

export default async function AgentRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const runs = await db().select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  const run = runs[0];
  if (!run) return notFound();
  const events = await db()
    .select()
    .from(agentRunEvents)
    .where(eq(agentRunEvents.runId, id))
    .orderBy(agentRunEvents.createdAt);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-baseline gap-3">
          <span className="text-xs uppercase tracking-wide text-[--color-muted]">{run.kind}</span>
          <h1 className="text-2xl font-semibold tracking-tight">Run {run.id.slice(0, 8)}</h1>
        </div>
        <p className="text-sm text-[--color-muted]">{run.request}</p>
      </header>

      <RunStream
        runId={run.id}
        kind={run.kind}
        initialStatus={run.status}
        initialPlanMd={run.planMd}
        initialEvents={events.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          body: e.body,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
