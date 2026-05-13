import Anthropic from '@anthropic-ai/sdk';
import { and, asc, eq } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { db, schema } from '../db.js';
import { env } from '../env.js';
import { log } from '../log.js';

const MODEL = 'claude-haiku-4-5-20251001';

type EntityKind = typeof schema.comments.$inferInsert['entityKind'];

export async function postBlockedRunSummary(input: {
  runId: string;
  entityKind: EntityKind;
  entityId: string;
  reason: string;
  detail: string;
}) {
  try {
    const existing = await db()
      .select({ id: schema.comments.id })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.entityKind, input.entityKind),
          eq(schema.comments.entityId, input.entityId),
          eq(schema.comments.agentRunId, input.runId),
          eq(schema.comments.authorKind, 'system'),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;

    const run = await loadRun(input.runId);
    const transcript = await buildRunTranscript(input.runId, run?.transcriptLogPath ?? null);
    const body = env.ANTHROPIC_API_KEY
      ? await summarizeWithHaiku({
          request: run?.request ?? '(missing request)',
          reason: input.reason,
          detail: input.detail,
          transcript,
        })
      : fallbackSummary(input, run?.request ?? '(missing request)', 'ANTHROPIC_API_KEY is not configured');

    await db().insert(schema.comments).values({
      entityKind: input.entityKind,
      entityId: input.entityId,
      authorKind: 'system',
      kind: 'discussion',
      body,
      agentRunId: input.runId,
    });
  } catch (err) {
    log.warn('blocked run summary failed', {
      runId: input.runId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

async function summarizeWithHaiku(input: {
  request: string;
  reason: string;
  detail: string;
  transcript: string;
}) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const completion = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 700,
      messages: [
        {
          role: 'user',
          content: `A Claude Code agent failed twice or could not be automatically recovered, so the issue was moved to blocked.

Write a concise human-readable blocked-issue note in markdown with exactly these headings:
**What happened**
**Likely cause**
**Recommended next step**
**Evidence**

Keep it specific. Mention the failed run id only if present in the transcript. Do not overclaim beyond the logs.

Original request:
${truncate(input.request, 3000)}

Failure reason:
${truncate(input.reason, 2000)}

Failure detail:
${truncate(input.detail, 3000)}

Transcript / logs:
${truncate(input.transcript, 18000)}`,
        },
      ],
    },
    { timeout: 30_000, maxRetries: 0 },
  );

  const text = completion.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
  if (!text) return fallbackSummary(input, input.request, 'Haiku returned an empty summary');
  return `**Blocked run summary (Claude Haiku 4.5)**\n\n${text}`;
}

async function loadRun(runId: string) {
  const rows = await db()
    .select({
      id: schema.agentRuns.id,
      request: schema.agentRuns.request,
      transcriptLogPath: schema.agentRuns.transcriptLogPath,
    })
    .from(schema.agentRuns)
    .where(eq(schema.agentRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

async function buildRunTranscript(runId: string, transcriptLogPath: string | null) {
  const events = await db()
    .select({
      eventType: schema.agentRunEvents.eventType,
      body: schema.agentRunEvents.body,
      createdAt: schema.agentRunEvents.createdAt,
    })
    .from(schema.agentRunEvents)
    .where(eq(schema.agentRunEvents.runId, runId))
    .orderBy(asc(schema.agentRunEvents.createdAt))
    .limit(160);

  const eventText = events
    .map((event) => {
      const body = event.body ? `: ${truncate(event.body, 1000)}` : '';
      return `- ${event.createdAt.toISOString()} ${event.eventType}${body}`;
    })
    .join('\n');

  if (!transcriptLogPath) return eventText;
  try {
    const raw = await readFile(transcriptLogPath, 'utf8');
    return `${eventText}\n\nTranscript file tail (${transcriptLogPath}):\n${tail(raw, 12000)}`;
  } catch (err) {
    return `${eventText}\n\nTranscript file unavailable (${transcriptLogPath}): ${
      err instanceof Error ? err.message : String(err)
    }`;
  }
}

function fallbackSummary(
  input: { reason: string; detail: string },
  request: string,
  summaryError: string,
) {
  return `**Blocked run summary (fallback)**

**What happened**
The issue was moved to blocked after automatic recovery did not produce a successful continuation.

**Likely cause**
${truncate(input.reason || input.detail || 'The runner did not record a specific cause.', 1000)}

**Recommended next step**
Open the failed run, inspect the raw event log, then resume manually after fixing the reported blocker.

**Evidence**
Original request: ${truncate(request, 1000)}

Summary generation note: ${summaryError}`;
}

function truncate(value: string | undefined, length: number) {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function tail(value: string, length: number) {
  return value.length > length ? value.slice(value.length - length) : value;
}
