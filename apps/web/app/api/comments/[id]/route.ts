import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { comments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { ForbiddenError, isOwner, requireEntityComment } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { createJobRun, updateJobRunStatus } from '@/lib/job-runs';

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
  const existingRows = await db().select().from(comments).where(eq(comments.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    await requireEntityComment(session, existing.entityKind, existing.entityId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  if (parsed.data.body !== undefined && existing.authorUserId !== session.user.id && !isOwner(session)) {
    return NextResponse.json({ error: 'author_or_owner_required' }, { status: 403 });
  }
  const updates: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.autoContinueClaude !== undefined) {
    updates.autoContinueClaude = parsed.data.autoContinueClaude;
  }
  const shouldSummarizeResolution = parsed.data.resolved === true;
  if (shouldSummarizeResolution) {
    updates.resolvedAt = new Date();
    updates.resolvedBy = session.user.id;
  } else if (parsed.data.resolved === false) {
    updates.resolvedAt = null;
    updates.resolvedBy = null;
  }
  const updated = await db()
    .update(comments)
    .set(updates)
    .where(eq(comments.id, id))
    .returning({
      id: comments.id,
      entityKind: comments.entityKind,
      entityId: comments.entityId,
    });
  const comment = updated[0];
  if (!comment) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let summaryResult: SummaryResult | undefined;
  if (shouldSummarizeResolution) {
    summaryResult = await runResolutionSummaryJob(id, session.user.id);
    await appendDailyLogTrailBestEffort({
      action: `Resolved comment thread ${id.slice(0, 8)}`,
      why: 'Mark the discussion as handled and preserve the resolution outcome for later review.',
      entityKind: comment.entityKind,
      entityId: comment.entityId,
      detail: summaryResult.summary ?? summaryResult.error,
      actorKind: 'user',
      actorUserId: session.user.id,
      jobRunId: summaryResult.jobRunId,
      correlationId: summaryResult.jobRunId ?? id,
    });
  }

  return NextResponse.json({ ok: true, summary: summaryResult });
}

interface SummaryResult {
  status: 'completed' | 'skipped' | 'failed';
  summary?: string;
  error?: string;
  jobRunId?: string;
}

async function runResolutionSummaryJob(rootCommentId: string, userId: string): Promise<SummaryResult> {
  let jobRunId: string | undefined;
  try {
    const job = await createJobRun({
      kind: 'comment_summary',
      requestedBy: userId,
      requestPayload: { rootCommentId },
    });
    jobRunId = job.id;
    await updateJobRunStatus(job.id, 'running');
    const result = await summarizeThreadAsync(rootCommentId);
    await updateJobRunStatus(job.id, result.status, {
      resultPayload: result.summary ? { summary: result.summary } : undefined,
      lastError: result.error,
    });
    return { ...result, jobRunId };
  } catch (err) {
    const error = summaryErrorMessage(err);
    if (jobRunId) {
      await updateJobRunStatus(jobRunId, 'failed', { lastError: error }).catch((jobErr) => {
        console.error('comment_summary_job_update_failed', jobErr);
      });
    }
    await db()
      .update(comments)
      .set({ resolvedSummaryMd: `Summary unavailable: ${error}`, updatedAt: new Date() })
      .where(eq(comments.id, rootCommentId))
      .catch((commentErr) => {
        console.error('comment_summary_visible_status_failed', commentErr);
      });
    return { status: 'failed', error, jobRunId };
  }
}

async function summarizeThreadAsync(rootCommentId: string): Promise<SummaryResult> {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    if (!process.env.ANTHROPIC_API_KEY) {
      return { status: 'skipped', error: 'ANTHROPIC_API_KEY is not configured' };
    }
    const root = await db().select().from(comments).where(eq(comments.id, rootCommentId)).limit(1);
    if (!root[0]) return { status: 'failed', error: 'comment_not_found' };
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
      return { status: 'completed', summary };
    }
    return { status: 'skipped', error: 'empty_summary' };
  } catch (err) {
    const error = summaryErrorMessage(err);
    await db()
      .update(comments)
      .set({ resolvedSummaryMd: `Summary unavailable: ${error}`, updatedAt: new Date() })
      .where(eq(comments.id, rootCommentId));
    return { status: 'failed', error };
  }
}

function summaryErrorMessage(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
}
