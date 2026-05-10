/**
 * Smoke test: insert an `agent_runs` row with kind=plan, NOTIFY the runner,
 * poll the row until it reaches `awaiting_approval`, print the captured plan.
 *
 * Run while the runner is up:
 *   pnpm --filter @sagan/runner dev   # in one terminal
 *   pnpm --filter @sagan/runner smoke # in another
 */
import '../src/env.js';
import { eq } from 'drizzle-orm';
import { db, schema, close } from '../src/db.js';
import { notifyQueued } from '../src/queue.js';

const DEFAULT_REQUEST = `Add a single-line comment "// smoke" at the top of services/runner/src/index.ts. Output a short plan describing the change. Do not actually edit any files in this run.`;

async function main() {
  const request = process.argv.slice(2).join(' ').trim() || DEFAULT_REQUEST;

  const inserted = await db()
    .insert(schema.agentRuns)
    .values({
      kind: 'plan',
      provider: 'claude_code',
      status: 'queued',
      request,
      approvalRequired: true,
    })
    .returning({ id: schema.agentRuns.id });

  const runId = inserted[0]?.id;
  if (!runId) throw new Error('insert returned no id');
  console.log(`[smoke] enqueued ${runId}`);

  await notifyQueued(runId);

  // Poll up to 5 minutes.
  const start = Date.now();
  while (Date.now() - start < 5 * 60_000) {
    const rows = await db()
      .select()
      .from(schema.agentRuns)
      .where(eq(schema.agentRuns.id, runId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('run row vanished');
    if (
      row.status === 'awaiting_approval' ||
      row.status === 'completed' ||
      row.status === 'failed' ||
      row.status === 'cancelled'
    ) {
      console.log(`[smoke] ${runId} status=${row.status}`);
      if (row.planMd) {
        console.log('--- plan ---');
        console.log(row.planMd);
        console.log('--- end plan ---');
      }
      if (row.lastError) console.error('[smoke] error:', row.lastError);
      await close();
      process.exit(row.status === 'failed' ? 1 : 0);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('[smoke] timed out waiting for terminal status');
  await close();
  process.exit(2);
}

main().catch(async (err) => {
  console.error(err);
  await close();
  process.exit(1);
});
