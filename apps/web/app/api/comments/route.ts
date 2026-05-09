import { NextResponse } from 'next/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRuns, comments } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isEntityKind } from '@/lib/entity';

const QUEUED_CHANNEL = 'agent_run_queued';

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const entityKind = url.searchParams.get('entityKind') ?? '';
  const entityId = url.searchParams.get('entityId') ?? '';
  if (!isEntityKind(entityKind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const rows = await db()
    .select()
    .from(comments)
    .where(and(eq(comments.entityKind, entityKind), eq(comments.entityId, entityId)))
    .orderBy(asc(comments.createdAt));
  return NextResponse.json({ comments: rows });
}

const createSchema = z.object({
  entityKind: z.enum(['project', 'belief', 'experiment', 'run', 'todo', 'lit_item', 'project_narrative']),
  entityId: z.string().uuid(),
  body: z.string().min(1).max(10_000),
  parentCommentId: z.string().uuid().optional(),
});

const ASK_CLAUDE_RE = /(^|\s)@claude\b/i;

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const isAskClaude = ASK_CLAUDE_RE.test(parsed.data.body);

  // Inherit auto_continue_claude from the parent thread, if any.
  let autoContinueClaude = false;
  if (parsed.data.parentCommentId) {
    const parentRows = await db()
      .select({ autoContinueClaude: comments.autoContinueClaude })
      .from(comments)
      .where(eq(comments.id, parsed.data.parentCommentId))
      .limit(1);
    autoContinueClaude = parentRows[0]?.autoContinueClaude ?? false;
  }

  const shouldDispatch = isAskClaude || autoContinueClaude;

  // Create the human comment first.
  const inserted = await db()
    .insert(comments)
    .values({
      entityKind: parsed.data.entityKind,
      entityId: parsed.data.entityId,
      parentCommentId: parsed.data.parentCommentId,
      authorUserId: session.user.id,
      authorKind: 'human',
      kind: isAskClaude ? 'ask_claude' : 'discussion',
      body: parsed.data.body,
      autoContinueClaude,
    })
    .returning();
  const comment = inserted[0]!;

  if (shouldDispatch) {
    // Build context including the existing thread so Claude has continuity.
    let threadContext = '';
    if (parsed.data.parentCommentId) {
      const thread = await db()
        .select({ authorKind: comments.authorKind, body: comments.body, createdAt: comments.createdAt })
        .from(comments)
        .where(eq(comments.parentCommentId, parsed.data.parentCommentId));
      const parentRows = await db()
        .select({ authorKind: comments.authorKind, body: comments.body, createdAt: comments.createdAt })
        .from(comments)
        .where(eq(comments.id, parsed.data.parentCommentId))
        .limit(1);
      const all = [...parentRows, ...thread].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      threadContext = `\n\nThread so far:\n${all
        .map((m) => `- [${m.authorKind}] ${m.body}`)
        .join('\n')}`;
    }
    const runRequest = `Reply to a comment thread on ${parsed.data.entityKind} ${parsed.data.entityId}.${threadContext}\n\nLatest message (user):\n\n${parsed.data.body}`;
    const run = await db()
      .insert(agentRuns)
      .values({
        kind: 'qa',
        provider: 'claude_code',
        status: 'queued',
        request: runRequest,
        scopeEntityKind: parsed.data.entityKind,
        scopeEntityId: parsed.data.entityId,
        approvalRequired: false,
      })
      .returning({ id: agentRuns.id });
    const runId = run[0]!.id;
    await db()
      .update(comments)
      .set({ agentRunId: runId, updatedAt: new Date() })
      .where(eq(comments.id, comment.id));
    await db().execute(sql`SELECT pg_notify(${QUEUED_CHANNEL}, ${runId})`);
    return NextResponse.json({ comment: { ...comment, agentRunId: runId }, runId });
  }

  return NextResponse.json({ comment });
}
