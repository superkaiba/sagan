import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns } from '@eps/db/schema';
import type { AgentRunKind } from '@eps/agent-protocol';
import { runRequestSchema } from '@eps/agent-protocol';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const QUEUED_CHANNEL = 'agent_run_queued';

export async function GET(req: Request) {
  await requireSessionOr401();
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const kind = url.searchParams.get('kind');
  const status = url.searchParams.get('status');
  let query = db().select().from(agentRuns).$dynamic();
  if (kind) query = query.where(eq(agentRuns.kind, kind as AgentRunKind));
  if (status) query = query.where(eq(agentRuns.status, status as never));
  const rows = await query.orderBy(desc(agentRuns.createdAt)).limit(limit);
  return NextResponse.json({ runs: rows });
}

export async function POST(req: Request) {
  await requireSessionOr401();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const { kind, request, scopeEntityKind, scopeEntityId, approvalRequired } = parsed.data;
  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind,
      provider: 'claude_code',
      status: 'queued',
      request,
      scopeEntityKind,
      scopeEntityId,
      approvalRequired,
    })
    .returning({ id: agentRuns.id });
  const runId = inserted[0]!.id;
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
  return NextResponse.json({ runId });
}

async function requireSessionOr401() {
  try {
    return await requireSession();
  } catch {
    throw new Response('unauthorized', { status: 401 });
  }
}
