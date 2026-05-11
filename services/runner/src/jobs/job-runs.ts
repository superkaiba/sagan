import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db.js';
import { log } from '../log.js';
import { recordTrail } from '../trail.js';

type JobRunInsert = typeof schema.jobRuns.$inferInsert;
type JobRunKind = JobRunInsert['kind'];
type JobRunStatus = NonNullable<JobRunInsert['status']>;
type TerminalJobStatus = Extract<JobRunStatus, 'completed' | 'failed' | 'skipped'>;

export interface JobContext {
  jobRunId?: string;
}

export interface JobOutcome {
  status?: TerminalJobStatus;
  resultPayload?: unknown;
  lastError?: string;
}

interface RunTrackedJobOptions {
  existingJobRunId?: string | null;
  requestPayload?: unknown;
  trigger?: string;
}

export async function runTrackedJob(
  kind: JobRunKind,
  work: (context: JobContext) => Promise<JobOutcome | unknown>,
  options: RunTrackedJobOptions = {},
) {
  const jobRunId = await startJobRun(kind, options);
  if (!jobRunId) return null;

  await recordTrail({
    action: `Started ${label(kind)} job`,
    why: 'The runner is executing a durable background job and recording its lifecycle.',
    jobRunId,
    correlationId: options.trigger,
    detail: options.requestPayload ? JSON.stringify(options.requestPayload).slice(0, 500) : undefined,
  });

  try {
    const raw = await work({ jobRunId });
    const outcome = normalizeOutcome(raw);
    await finishJobRun(jobRunId, outcome);
    await recordTrail({
      action: `${outcome.status === 'skipped' ? 'Skipped' : outcome.status === 'failed' ? 'Failed' : 'Completed'} ${label(kind)} job`,
      why: 'Record the durable outcome of the background job.',
      jobRunId,
      correlationId: options.trigger,
      detail: summarizeOutcome(outcome),
    });
    return { jobRunId, ...outcome };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const outcome: Required<Pick<JobOutcome, 'status' | 'lastError'>> & Pick<JobOutcome, 'resultPayload'> = {
      status: 'failed',
      lastError: message,
    };
    await finishJobRun(jobRunId, outcome);
    await recordTrail({
      action: `Failed ${label(kind)} job`,
      why: 'The background job threw before producing a normal outcome.',
      jobRunId,
      correlationId: options.trigger,
      detail: message.slice(0, 500),
    });
    throw err;
  }
}

async function startJobRun(kind: JobRunKind, options: RunTrackedJobOptions): Promise<string | null> {
  const now = new Date();
  if (options.existingJobRunId) {
    const claimed = await db()
      .update(schema.jobRuns)
      .set({ status: 'running', startedAt: now, updatedAt: now })
      .where(
        and(
          eq(schema.jobRuns.id, options.existingJobRunId),
          eq(schema.jobRuns.kind, kind),
          eq(schema.jobRuns.status, 'queued'),
        ),
      )
      .returning({ id: schema.jobRuns.id });
    if (claimed[0]) return claimed[0].id;

    const existing = await db()
      .select({ status: schema.jobRuns.status, kind: schema.jobRuns.kind })
      .from(schema.jobRuns)
      .where(eq(schema.jobRuns.id, options.existingJobRunId))
      .limit(1);
    log.info('job run not claimable', {
      jobRunId: options.existingJobRunId,
      expectedKind: kind,
      actualKind: existing[0]?.kind,
      status: existing[0]?.status,
    });
    return null;
  }

  const inserted = await db()
    .insert(schema.jobRuns)
    .values({
      kind,
      status: 'running',
      requestPayload: options.requestPayload,
      startedAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.jobRuns.id });
  return inserted[0]!.id;
}

async function finishJobRun(jobRunId: string, outcome: JobOutcome & { status: TerminalJobStatus }) {
  const now = new Date();
  await db()
    .update(schema.jobRuns)
    .set({
      status: outcome.status,
      resultPayload: outcome.resultPayload,
      lastError: outcome.lastError ? outcome.lastError.slice(0, 4000) : null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(schema.jobRuns.id, jobRunId));
}

function normalizeOutcome(value: JobOutcome | unknown): JobOutcome & { status: TerminalJobStatus } {
  if (isJobOutcome(value)) {
    return {
      status: value.status ?? 'completed',
      resultPayload: value.resultPayload,
      lastError: value.lastError,
    };
  }
  return { status: 'completed', resultPayload: value };
}

function isJobOutcome(value: unknown): value is JobOutcome {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { status?: unknown; resultPayload?: unknown; lastError?: unknown };
  if (!('status' in candidate) && !('resultPayload' in candidate) && !('lastError' in candidate)) {
    return false;
  }
  const status = candidate.status;
  return status === undefined || status === 'completed' || status === 'failed' || status === 'skipped';
}

function summarizeOutcome(outcome: JobOutcome): string | undefined {
  const parts = [
    outcome.lastError ? `error=${outcome.lastError.slice(0, 300)}` : null,
    outcome.resultPayload ? JSON.stringify(outcome.resultPayload).slice(0, 500) : null,
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : undefined;
}

function label(kind: JobRunKind) {
  return kind.replaceAll('_', ' ');
}
