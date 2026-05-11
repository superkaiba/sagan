import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { createCorrelationId, createJobRun, updateJobRunStatus } from '@/lib/job-runs';

const inputSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  question: z.string().max(1000).optional(),
  answer: z.string().max(5000).optional(),
});

const MODEL = 'claude-haiku-4-5-20251001';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const day = parsed.data.day ?? todayIso();
  const correlationId = createCorrelationId('clean_result');
  const job = await createJobRun({
    kind: 'clean_result',
    requestedBy: session.user.id,
    requestPayload: {
      day,
      correlationId,
      hasQuestion: Boolean(parsed.data.question),
      hasAnswer: Boolean(parsed.data.answer),
    },
  });
  await updateJobRunStatus(job.id, 'running');

  if (!process.env.ANTHROPIC_API_KEY) {
    await updateJobRunStatus(job.id, 'failed', { lastError: 'anthropic_not_configured' });
    return NextResponse.json({ error: 'anthropic_not_configured', jobRunId: job.id, correlationId }, { status: 503 });
  }

  try {
    const entries = await db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, day), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [
        {
          role: 'user',
          content: `Draft exactly one clean research result for a mentor-facing daily log.

Use ONLY the existing daily log entries and the user's clarification below. Do not inspect the codebase. Do not run Claude Code. Do not search the web. Do not invent evidence.

Date: ${day}

Existing daily log entries:
${JSON.stringify(
  entries.map((e) => ({ kind: e.kind, body: e.bodyMd, createdAt: e.createdAt })),
  null,
  2,
)}

Clarifying question:
${parsed.data.question ?? '(none)'}

User answer:
${parsed.data.answer ?? '(none)'}

Output markdown only. Keep it concise and concrete:
- Start with a bold one-sentence result.
- Include the evidence or observation that supports it.
- Include caveat/confidence if available.
- Include the next test only if it follows directly from the entries.`,
        },
      ],
    });
    const bodyMd = completion.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('\n')
      .trim();

    if (!bodyMd) {
      await updateJobRunStatus(job.id, 'failed', { lastError: 'empty_result' });
      return NextResponse.json({ error: 'empty_result', jobRunId: job.id, correlationId }, { status: 502 });
    }

    const inserted = await db()
      .insert(dailyLogEntries)
      .values({
        day,
        kind: 'clean_result',
        bodyMd,
      })
      .returning();

    await updateJobRunStatus(job.id, 'completed', {
      resultPayload: { dailyLogEntryId: inserted[0]!.id, model: MODEL },
    });
    await appendDailyLogTrailBestEffort({
      day,
      action: `Generated clean result ${inserted[0]!.id.slice(0, 8)} with Haiku`,
      why: 'Convert existing logged work into a mentor-facing result after asking one clarification question.',
      detail: parsed.data.answer ? `Clarification used: ${parsed.data.answer.slice(0, 500)}` : undefined,
      actorKind: 'user',
      actorUserId: session.user.id,
      jobRunId: job.id,
      correlationId,
    });

    return NextResponse.json({ entry: inserted[0], model: MODEL, jobRunId: job.id, correlationId });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500);
    await updateJobRunStatus(job.id, 'failed', { lastError: message });
    return NextResponse.json({ error: 'clean_result_failed', message, jobRunId: job.id, correlationId }, { status: 502 });
  }
}
