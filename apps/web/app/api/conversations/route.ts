import { NextResponse } from 'next/server';
import { desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, chatMessages, chatSessions, users } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  mode: z.enum(['chat', 'improve']).default('chat'),
});

type RunRow = {
  id: string;
  kind: typeof agentRuns.$inferSelect.kind;
  status: typeof agentRuns.$inferSelect.status;
  request: string;
  updatedAt: Date;
};

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const rows = await db()
    .select({
      id: chatSessions.id,
      agentHandle: chatSessions.agentHandle,
      createdByUserId: chatSessions.createdByUserId,
      createdByEmail: users.email,
      lastMessageAt: chatSessions.lastMessageAt,
      createdAt: chatSessions.createdAt,
      messageCount: sql<number>`(SELECT count(*)::int FROM ${chatMessages} WHERE ${chatMessages.sessionId} = ${chatSessions.id})`,
    })
    .from(chatSessions)
    .leftJoin(users, eq(users.id, chatSessions.createdByUserId))
    .where(andNullScope())
    .orderBy(desc(chatSessions.lastMessageAt), desc(chatSessions.createdAt))
    .limit(40);

  const sessions = await Promise.all(
    rows.map(async (session) => {
      const [firstMessage, lastRun, activeRunCount] = await Promise.all([
        firstUserMessage(session.id),
        latestRun(session.id),
        countActiveRuns(session.id),
      ]);
      const kind = inferConversationKind(firstMessage?.body, lastRun);
      return {
        ...session,
        kind,
        title: titleForConversation(kind, firstMessage?.body, lastRun),
        latestRun: lastRun,
        activeRunCount,
      };
    }),
  );

  return NextResponse.json({ sessions });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const inserted = await db()
    .insert(chatSessions)
    .values({
      createdByUserId: session.user.id,
      lastMessageAt: new Date(),
    })
    .returning({
      id: chatSessions.id,
      agentHandle: chatSessions.agentHandle,
      createdByUserId: chatSessions.createdByUserId,
      lastMessageAt: chatSessions.lastMessageAt,
      createdAt: chatSessions.createdAt,
    });

  const row = inserted[0]!;
  return NextResponse.json({
    session: {
      ...row,
      createdByEmail: session.user.email,
      kind: parsed.data.mode,
      title: parsed.data.mode === 'improve' ? 'Dashboard improvement' : 'New conversation',
      messageCount: 0,
      latestRun: null,
      activeRunCount: 0,
    },
  });
}

function andNullScope() {
  return sql`${chatSessions.scopeEntityKind} IS NULL AND ${chatSessions.scopeEntityId} IS NULL`;
}

async function firstUserMessage(sessionId: string) {
  const rows = await db()
    .select({ body: chatMessages.body })
    .from(chatMessages)
    .where(sql`${chatMessages.sessionId} = ${sessionId} AND ${chatMessages.role} = 'user'`)
    .orderBy(chatMessages.createdAt)
    .limit(1);
  return rows[0] ?? null;
}

async function latestRun(sessionId: string): Promise<RunRow | null> {
  const rows = await db()
    .select({
      id: agentRuns.id,
      kind: agentRuns.kind,
      status: agentRuns.status,
      request: agentRuns.request,
      updatedAt: agentRuns.updatedAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.chatSessionId, sessionId))
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

async function countActiveRuns(sessionId: string) {
  const rows = await db()
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(agentRuns)
    .where(sql`${agentRuns.chatSessionId} = ${sessionId} AND ${agentRuns.status} IN ('queued', 'running', 'approved', 'deploying', 'awaiting_approval')`);
  return rows[0]?.count ?? 0;
}

function inferConversationKind(firstBody: string | null | undefined, latest: RunRow | null) {
  if (latest?.kind === 'apply' || firstBody?.startsWith('[Dashboard improvement]')) return 'improve';
  return 'chat';
}

function titleForConversation(kind: 'chat' | 'improve', firstBody: string | null | undefined, latest: RunRow | null) {
  const raw = firstBody?.replace(/^\[Dashboard improvement\]\s*/i, '').trim() || latest?.request.trim();
  if (!raw) return kind === 'improve' ? 'Dashboard improvement' : 'New conversation';
  const prefix = kind === 'improve' ? 'Improve: ' : '';
  return `${prefix}${raw.length > 72 ? `${raw.slice(0, 72)}...` : raw}`;
}
