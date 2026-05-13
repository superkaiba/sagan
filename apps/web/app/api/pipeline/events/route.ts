import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

/**
 * SSE stream that emits a `changed` event whenever any dashboard-relevant
 * entity has a newer timestamp than the last tick. Clients re-fetch the
 * current route on each event, which updates the board and sidebar without a
 * full page reload.
 *
 * Polling is used (not Postgres LISTEN) because Vercel serverless functions
 * cannot hold a dedicated database connection. The runner still emits
 * `pg_notify('pipeline_changed', ...)` — long-running consumers like the VM
 * services can subscribe to it directly; the dashboard polls.
 */
export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return new Response('unauthorized', { status: 401 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let lastMaxTs: number | null = null;

      function send(event: string, data: unknown) {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function close() {
        try {
          controller.close();
        } catch {
          // ignore
        }
      }

      // Emit one immediate heartbeat so clients confirm the channel is live.
      send('hello', { at: new Date().toISOString() });

      // Poll loop. 2s tick keeps perceived latency low while staying cheap.
      let stopped = false;
      req.signal.addEventListener(
        'abort',
        () => {
          stopped = true;
          close();
        },
        { once: true },
      );

      while (!stopped) {
        try {
          const rows = await db().execute(sql`
            SELECT GREATEST(
              COALESCE((SELECT MAX(updated_at) FROM todos), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM experiments), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM clean_results), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM agent_runs), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM pod_lifecycle), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM approval_requests), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM daily_log_entries), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(created_at) FROM workflow_events), 'epoch'::timestamptz),
              COALESCE(
                (
                  SELECT MAX(
                    GREATEST(
                      drafted_at,
                      COALESCE(edited_at, 'epoch'::timestamptz),
                      COALESCE(sent_at, 'epoch'::timestamptz)
                    )
                  )
                  FROM weekly_digests
                ),
                'epoch'::timestamptz
              ),
              COALESCE((SELECT MAX(updated_at) FROM project_narratives), 'epoch'::timestamptz),
              COALESCE((SELECT MAX(updated_at) FROM projects), 'epoch'::timestamptz)
            ) AS max_ts
          `);
          const raw = (rows as unknown as Array<{ max_ts: string | Date }>)[0]?.max_ts;
          const ts = raw ? new Date(raw).getTime() : 0;
          if (lastMaxTs === null) {
            lastMaxTs = ts;
          } else if (ts > lastMaxTs) {
            lastMaxTs = ts;
            send('changed', { at: new Date(ts).toISOString() });
          }
        } catch (err) {
          send('error', { message: err instanceof Error ? err.message : 'poll_failed' });
        }
        await new Promise((r) => setTimeout(r, 2_000));
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
