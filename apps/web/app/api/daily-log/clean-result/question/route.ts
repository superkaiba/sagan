import { agentDispatchEnabled, agentDispatchDisabledResponse } from '@/lib/agent-dispatch';
import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const inputSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const MODEL = 'claude-haiku-4-5-20251001';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  if (!agentDispatchEnabled) return agentDispatchDisabledResponse();
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'anthropic_not_configured' }, { status: 503 });
  }

  const day = parsed.data.day ?? todayIso();
  const entries = await db()
    .select()
    .from(dailyLogEntries)
    .where(and(eq(dailyLogEntries.day, day), isNull(dailyLogEntries.archivedAt)))
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));

  if (entries.length === 0) {
    return NextResponse.json({
      question: 'What is the most concrete result from today, and what evidence makes it worth showing?',
      model: MODEL,
    });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 160,
    messages: [
      {
        role: 'user',
        content: `You are helping turn today's existing research log into one mentor-facing clean result.

Use ONLY the entries below. Do not ask to inspect the codebase. Do not ask to run Claude Code. Do not request web search.

Daily log entries for ${day}:
${JSON.stringify(
  entries.map((e) => ({ kind: e.kind, body: e.bodyMd, createdAt: e.createdAt })),
  null,
  2,
)}

Ask exactly ONE short question that would let the user clarify the clean result before generation. If the result is already clear, ask for the missing caveat, confidence, or next test.`,
      },
    ],
  });
  const question = completion.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join(' ')
    .trim()
    .replace(/^["']|["']$/g, '');

  return NextResponse.json({
    question: question || 'What evidence or caveat should the mentor see with this result?',
    model: MODEL,
  });
}
