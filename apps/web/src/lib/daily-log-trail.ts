import { auditEventCreateSchema } from '@sagan/api';
import { auditEvents, dailyLogEntries } from '@sagan/db/schema';
import { z } from 'zod';
import { db } from './db';

interface TrailInput extends z.input<typeof auditEventCreateSchema> {
  actorKind?: 'user' | 'system' | 'job';
  actorUserId?: string;
  mirrorToDailyLog?: boolean;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function appendDailyLogTrail(input: TrailInput) {
  const parsed = auditEventCreateSchema.parse(input);
  const day = parsed.day ?? todayIso();
  const mirrorToDailyLog = input.mirrorToDailyLog ?? true;
  let wroteAudit = false;
  let wroteDaily = false;

  try {
    await db().insert(auditEvents).values({
      day,
      actorKind: input.actorKind ?? (input.actorUserId ? 'user' : 'system'),
      actorUserId: input.actorUserId,
      action: parsed.action,
      why: parsed.why,
      detail: parsed.detail,
      entityKind: parsed.entityKind,
      entityId: parsed.entityId,
      source: parsed.source,
      correlationId: parsed.correlationId,
      agentRunId: parsed.agentRunId,
      jobRunId: parsed.jobRunId,
    });
    wroteAudit = true;
  } catch (err) {
    console.error('audit_event_insert_failed', err);
  }

  if (!mirrorToDailyLog) {
    if (!wroteAudit) throw new Error('audit_event_insert_failed');
    return;
  }

  const bodyMd = [
    `**Action:** ${parsed.action}`,
    `**Why:** ${parsed.why}`,
    parsed.detail ? `**Detail:** ${parsed.detail}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    await db().insert(dailyLogEntries).values({
      day,
      kind: 'note',
      bodyMd,
      entityKind: parsed.entityKind,
      entityId: parsed.entityId,
    });
    wroteDaily = true;
  } catch (err) {
    console.error('daily_log_trail_insert_failed', err);
  }

  if (!wroteAudit && !wroteDaily) {
    throw new Error('workflow_trail_insert_failed');
  }
}

export async function appendDailyLogTrailBestEffort(input: TrailInput) {
  try {
    await appendDailyLogTrail(input);
  } catch (err) {
    console.error('workflow_trail_best_effort_failed', err);
  }
}
