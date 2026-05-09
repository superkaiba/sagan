import { and, eq, gt } from 'drizzle-orm';
import { agentRuns, agentRunEvents } from '@eps/db/schema';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';

const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'rejected',
]);

/**
 * Server-Sent Events stream of agent_run_events for a single run, plus
 * status pings every poll. Closes when the run reaches a terminal status.
 *
 * Format:
 *   event: event
 *   data: { ...row }
 *
 *   event: status
 *   data: { status: "running", ... }
 *
 *   event: done
 *   data: { status: "completed" }
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });
  const { id } = await ctx.params;

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let lastEventTs: Date | null = null;
      let lastStatus: string | null = null;

      function send(event: string, data: unknown) {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      // Initial backfill.
      const allEvents = await db()
        .select()
        .from(agentRunEvents)
        .where(eq(agentRunEvents.runId, id))
        .orderBy(agentRunEvents.createdAt);
      for (const ev of allEvents) {
        send('event', ev);
        lastEventTs = ev.createdAt;
      }

      let stop = false;
      const cleanup = () => { stop = true; controller.close(); };

      // Poll loop.
      while (!stop) {
        const runRows = await db()
          .select()
          .from(agentRuns)
          .where(eq(agentRuns.id, id))
          .limit(1);
        const run = runRows[0];
        if (!run) {
          send('error', { error: 'not_found' });
          cleanup();
          return;
        }
        if (run.status !== lastStatus) {
          send('status', { status: run.status, planMd: run.planMd, lastError: run.lastError });
          lastStatus = run.status;
        }

        const newEvents = await db()
          .select()
          .from(agentRunEvents)
          .where(
            lastEventTs
              ? and(eq(agentRunEvents.runId, id), gt(agentRunEvents.createdAt, lastEventTs))
              : eq(agentRunEvents.runId, id),
          )
          .orderBy(agentRunEvents.createdAt);
        for (const ev of newEvents) {
          send('event', ev);
          lastEventTs = ev.createdAt;
        }

        if (TERMINAL_STATUSES.has(run.status)) {
          send('done', { status: run.status });
          cleanup();
          return;
        }
        // 1s tick.
        await new Promise((r) => setTimeout(r, 1000));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
