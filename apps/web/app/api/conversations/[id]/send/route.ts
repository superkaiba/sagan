import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, chatMessages, chatSessions } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const QUEUED_CHANNEL = 'agent_run_queued';

const sendSchema = z.object({
  body: z.string().trim().min(1).max(12_000),
  mode: z.enum(['chat', 'improve']).default('chat'),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const conversationRows = await db()
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);
  if (!conversationRows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const now = new Date();
  const userBody =
    parsed.data.mode === 'improve'
      ? `[Dashboard improvement]\n${parsed.data.body}`
      : parsed.data.body;
  const insertedMessage = await db()
    .insert(chatMessages)
    .values({
      sessionId: id,
      role: 'user',
      body: userBody,
    })
    .returning({
      id: chatMessages.id,
      role: chatMessages.role,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
    });

  await db().update(chatSessions).set({ lastMessageAt: now, archivedAt: null }).where(eq(chatSessions.id, id));

  const kind = parsed.data.mode === 'improve' ? 'apply' : 'qa';
  const runRows = await db()
    .insert(agentRuns)
    .values({
      kind,
      provider: 'claude_code',
      status: 'queued',
      request: parsed.data.body,
      chatSessionId: id,
      approvalRequired: false,
    })
    .returning({
      id: agentRuns.id,
      kind: agentRuns.kind,
      status: agentRuns.status,
      request: agentRuns.request,
      createdAt: agentRuns.createdAt,
      updatedAt: agentRuns.updatedAt,
    });
  const run = runRows[0]!;

  await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${run.id})`);
  await appendDailyLogTrailBestEffort({
    action: `Started ${parsed.data.mode === 'improve' ? 'dashboard improvement' : 'dashboard chat'} run ${run.id.slice(0, 8)}`,
    why: parsed.data.body.slice(0, 500),
    actorKind: 'user',
    actorUserId: session.user.id,
    agentRunId: run.id,
    correlationId: run.id,
  });

  return NextResponse.json({ message: insertedMessage[0], run });
}
