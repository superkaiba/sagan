import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { agentRuns, agentRunEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const TERMINAL_STATUSES = new Set([
  'completed',
  'failed',
  'cancelled',
  'rejected',
  'blocked',
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
  try {
    await requireSession();
  } catch {
    return new Response('unauthorized', { status: 401 });
  }
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
          send('status', { status: run.status, planMd: run.planMd, planJson: run.planJson, lastError: run.lastError });
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

// Batched ingest from pod-side log shippers and other producers.
const eventSchema = z.object({
  eventType: z.string().min(1).max(64),
  body: z.string().max(50_000).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
const postSchema = z.object({
  events: z.array(eventSchema).min(1).max(200),
});

const MAX_BODY_BYTES = 256 * 1024;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  // Cheap upper bound on the raw payload — the per-line cap is enforced
  // by the zod schema below, so the body cap here just stops obviously
  // pathological POSTs.
  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const json = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', detail: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  // Confirm the parent run exists before inserting (so an unknown UUID
  // returns 404 rather than silently fanning rows into the wrong run).
  const runRows = await db()
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  if (!runRows[0]) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const rows = parsed.data.events.map((ev) => ({
    runId: id,
    eventType: ev.eventType,
    body: ev.body ?? null,
    metadata: ev.metadata ?? null,
  }));
  const inserted = await db().insert(agentRunEvents).values(rows).returning({ id: agentRunEvents.id });
  return NextResponse.json({ inserted: inserted.length });
}
