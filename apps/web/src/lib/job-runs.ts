import type { JobRunKind, JobRunStatus } from '@sagan/api';
import { jobRuns } from '@sagan/db/schema';
import { eq } from 'drizzle-orm';
import { db } from './db';

interface CreateJobRunInput {
  kind: JobRunKind;
  requestedBy?: string;
  requestPayload?: Record<string, unknown>;
}

export function createCorrelationId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export async function createJobRun(input: CreateJobRunInput) {
  const inserted = await db()
    .insert(jobRuns)
    .values({
      kind: input.kind,
      status: 'queued',
      requestedBy: input.requestedBy,
      requestPayload: input.requestPayload,
    })
    .returning();
  return inserted[0]!;
}

export async function updateJobRunStatus(
  id: string,
  status: JobRunStatus,
  detail?: {
    resultPayload?: Record<string, unknown>;
    lastError?: string;
  },
) {
  const now = new Date();
  const values: Partial<typeof jobRuns.$inferInsert> = {
    status,
    updatedAt: now,
  };
  if (detail?.resultPayload !== undefined) values.resultPayload = detail.resultPayload;
  if (detail?.lastError !== undefined) values.lastError = detail.lastError;
  if (status === 'running') values.startedAt = now;
  if (['completed', 'failed', 'skipped'].includes(status)) values.completedAt = now;

  const updated = await db()
    .update(jobRuns)
    .set(values)
    .where(eq(jobRuns.id, id))
    .returning();
  return updated[0] ?? null;
}
