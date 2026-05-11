import { db, schema } from './db.js';
import { log } from './log.js';

type AuditEventInsert = typeof schema.auditEvents.$inferInsert;
type EntityKind = AuditEventInsert['entityKind'];

interface TrailInput {
  action: string;
  why: string;
  entityKind?: EntityKind | null;
  entityId?: string | null;
  detail?: string;
  correlationId?: string;
  agentRunId?: string | null;
  jobRunId?: string | null;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function recordTrail(input: TrailInput) {
  const day = todayIso();
  const bodyMd = [
    `**Action:** ${input.action}`,
    `**Why:** ${input.why}`,
    input.detail ? `**Detail:** ${input.detail}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    await db().insert(schema.auditEvents).values({
      day,
      actorKind: 'system',
      action: input.action,
      why: input.why,
      detail: input.detail,
      entityKind: input.entityKind ?? undefined,
      entityId: input.entityId ?? undefined,
      source: 'runner',
      correlationId: input.correlationId,
      agentRunId: input.agentRunId ?? undefined,
      jobRunId: input.jobRunId ?? undefined,
    });
  } catch (err) {
    log.warn('structured audit write failed; continuing', {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    await db().insert(schema.dailyLogEntries).values({
      day,
      kind: 'note',
      bodyMd,
      entityKind: input.entityKind ?? undefined,
      entityId: input.entityId ?? undefined,
    });
  } catch (err) {
    log.warn('daily trail write failed; continuing', {
      action: input.action,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
