/**
 * Apply-mode smoke test.
 *
 * Inserts an `agent_runs` row with kind=apply, asks Claude to write a
 * marker file at services/runner/.smoke-marker.txt with a timestamp,
 * waits for status=completed, verifies the file exists. The marker is
 * cleaned up at the end.
 *
 * Run while the runner is up:
 *   pnpm --filter @eps/runner dev         # in one terminal
 *   pnpm --filter @eps/runner smoke-apply # in another
 */
import '../src/env.js';
import path from 'node:path';
import fs from 'node:fs';
import { eq } from 'drizzle-orm';
import { db, schema, close } from '../src/db.js';
import { notifyQueued } from '../src/queue.js';
import { env } from '../src/env.js';

const MARKER_RELPATH = 'services/runner/.smoke-marker.txt';

async function main() {
  const markerAbs = path.resolve(env.RUNNER_REPO_ROOT, MARKER_RELPATH);
  // Clean any leftover from a prior run.
  fs.rmSync(markerAbs, { force: true });

  const stamp = new Date().toISOString();
  const request = `Use the Write tool to create a file at ${MARKER_RELPATH} with exactly this content (no trailing newline beyond what you naturally produce):\n\nsmoke ${stamp}\n\nDo not run any other tools, do not edit other files, do not commit anything. Stop after the file is written.`;

  const inserted = await db()
    .insert(schema.agentRuns)
    .values({
      kind: 'apply',
      provider: 'claude_code',
      status: 'queued',
      request,
      approvalRequired: false,
    })
    .returning({ id: schema.agentRuns.id });
  const runId = inserted[0]?.id;
  if (!runId) throw new Error('insert returned no id');
  console.log(`[smoke-apply] enqueued ${runId}`);

  await notifyQueued(runId);

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
      row.status === 'completed' ||
      row.status === 'failed' ||
      row.status === 'cancelled'
    ) {
      console.log(`[smoke-apply] ${runId} status=${row.status}`);
      if (row.lastError) console.error('[smoke-apply] error:', row.lastError);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Verify
  const exists = fs.existsSync(markerAbs);
  let content = '';
  if (exists) content = fs.readFileSync(markerAbs, 'utf8').trim();
  console.log(`[smoke-apply] marker exists=${exists} content="${content}"`);

  // Cleanup
  fs.rmSync(markerAbs, { force: true });

  await close();
  if (!exists || !content.startsWith(`smoke ${stamp.slice(0, 10)}`)) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err);
  await close();
  process.exit(1);
});
