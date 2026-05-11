import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns } from '@sagan/db/schema';
import { agentRunKindSchema, agentRunStatusSchema, runRequestSchema } from '@sagan/agent-protocol';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const QUEUED_CHANNEL = 'agent_run_queued';
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  kind: agentRunKindSchema.optional(),
  status: agentRunStatusSchema.optional(),
});

export async function GET(req: Request) {
  const session = await getSessionOrResponse();
  if (session instanceof NextResponse) return session;

  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
    kind: url.searchParams.get('kind') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_query', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const { limit, kind, status } = parsed.data;
  const filters = [
    kind ? eq(agentRuns.kind, kind) : undefined,
    status ? eq(agentRuns.status, status) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));

  let query = db().select().from(agentRuns).$dynamic();
  if (filters.length) query = query.where(and(...filters));
  const rows = await query.orderBy(desc(agentRuns.createdAt)).limit(limit);
  return NextResponse.json({ runs: rows });
}

export async function POST(req: Request) {
  const session = await getSessionOrResponse();
  if (session instanceof NextResponse) return session;

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
  const { kind, request, scopeEntityKind, scopeEntityId, chatSessionId, approvalRequired } = parsed.data;
  const inserted = await db()
    .insert(agentRuns)
    .values({
      kind,
      provider: 'claude_code',
      status: 'queued',
      request,
      scopeEntityKind,
      scopeEntityId,
      chatSessionId,
      approvalRequired,
    })
    .returning({ id: agentRuns.id });
  const runId = inserted[0]!.id;
  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
  await appendDailyLogTrailBestEffort({
    action: `Dispatched ${kind} agent run ${runId.slice(0, 8)}`,
    why: request.slice(0, 500),
    entityKind: scopeEntityKind,
    entityId: scopeEntityId,
    detail: `Approval required: ${approvalRequired ? 'yes' : 'no'}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: runId,
    correlationId: runId,
  });
  return NextResponse.json({ runId });
}

async function getSessionOrResponse() {
  try {
    return await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
