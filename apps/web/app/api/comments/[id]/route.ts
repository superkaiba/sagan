import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { comments } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  body: z.string().min(1).max(10_000).optional(),
  resolved: z.boolean().optional(),
  autoContinueClaude: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const updates: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.autoContinueClaude !== undefined) {
    updates.autoContinueClaude = parsed.data.autoContinueClaude;
  }
  if (parsed.data.resolved === true) {
    updates.resolvedAt = new Date();
    updates.resolvedBy = session.user.id;
    // Generate a one-line summary of the thread (best-effort, fire-and-forget).
    void summarizeThreadAsync(id);
  } else if (parsed.data.resolved === false) {
    updates.resolvedAt = null;
    updates.resolvedBy = null;
  }
  await db().update(comments).set(updates).where(eq(comments.id, id));
  return NextResponse.json({ ok: true });
}

async function summarizeThreadAsync(rootCommentId: string) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    if (!process.env.ANTHROPIC_API_KEY) return;
    const root = await db().select().from(comments).where(eq(comments.id, rootCommentId)).limit(1);
    if (!root[0]) return;
    // Collect parent + replies (one level deep).
    const replies = await db().select().from(comments).where(eq(comments.parentCommentId, rootCommentId));
    const all = [root[0], ...replies].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const transcript = all.map((c) => `[${c.authorKind}] ${c.body}`).join('\n\n');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Summarize this resolved discussion in ONE concise sentence (≤25 words). No preamble.\n\n${transcript}`,
        },
      ],
    });
    const summary = completion.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join(' ')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (summary) {
      await db()
        .update(comments)
        .set({ resolvedSummaryMd: summary, updatedAt: new Date() })
        .where(eq(comments.id, rootCommentId));
    }
  } catch {
    // Summary is best-effort; failures don't block resolution.
  }
}
