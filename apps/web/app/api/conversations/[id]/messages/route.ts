import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { agentRuns, chatMessages, chatSessions } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const sessionRows = await db().select({ id: chatSessions.id }).from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
  if (!sessionRows[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const [messages, runs] = await Promise.all([
    db()
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        body: chatMessages.body,
        toolCallJson: chatMessages.toolCallJson,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, id))
      .orderBy(asc(chatMessages.createdAt)),
    db()
      .select({
        id: agentRuns.id,
        kind: agentRuns.kind,
        status: agentRuns.status,
        request: agentRuns.request,
        lastError: agentRuns.lastError,
        updatedAt: agentRuns.updatedAt,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.chatSessionId, id))
      .orderBy(asc(agentRuns.createdAt)),
  ]);

  return NextResponse.json({ messages, runs });
}
