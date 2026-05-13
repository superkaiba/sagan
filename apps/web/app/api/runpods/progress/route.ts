import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRunEvents, experiments, podLifecycle, workflowEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { mergeExperimentProgress } from '@/lib/experiment-estimate';

type JsonRecord = Record<string, unknown>;

const progressSchema = z
  .object({
    token: z.string().min(16).max(256).optional(),
    podId: z.string().min(3).max(128).optional(),
    estimatedRemainingMinutes: z.number().int().min(0).max(60 * 24 * 30).nullable().optional(),
    progressPct: z.number().min(0).max(100).nullable().optional(),
    status: z.string().max(80).optional(),
    message: z.string().max(2_000).optional(),
    /**
     * Tail of the user-cmd's stderr (or stdout fallback) when the experiment
     * exits non-zero. The pod's bootstrap captures up to ~15.5KB; we cap at
     * 16KB defensively. Surfaced via runpod_progress event metadata and
     * pod_lifecycle.metadata.saganProgress so the orchestrator and the
     * dashboard can see the actual failure reason instead of only an exit
     * code. Optional — omitted on success.
     */
    errorTail: z.string().max(16_384).optional(),
  })
  .refine(
    (value) =>
      value.estimatedRemainingMinutes !== undefined ||
      value.progressPct !== undefined ||
      value.status !== undefined ||
      value.message !== undefined ||
      value.errorTail !== undefined,
    { message: 'at least one progress field is required' },
  );

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = progressSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const token = bearerToken(req) ?? parsed.data.token;
  if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 401 });

  const conditions = [sql`${podLifecycle.metadata}->'saganProgress'->>'token' = ${token}`];
  if (parsed.data.podId) conditions.push(eq(podLifecycle.runpodPodId, parsed.data.podId));
  const rows = await db()
    .select({
      id: podLifecycle.id,
      runpodPodId: podLifecycle.runpodPodId,
      agentRunId: podLifecycle.agentRunId,
      experimentId: podLifecycle.experimentId,
      metadata: podLifecycle.metadata,
    })
    .from(podLifecycle)
    .where(and(...conditions))
    .limit(1);
  const pod = rows[0];
  if (!pod) return NextResponse.json({ error: 'invalid_token' }, { status: 403 });

  const now = new Date();
  const metadata = mergeProgressMetadata(pod.metadata, {
    token,
    reportedAt: now.toISOString(),
    estimatedRemainingMinutes: parsed.data.estimatedRemainingMinutes,
    progressPct: parsed.data.progressPct,
    status: parsed.data.status,
    message: parsed.data.message,
    errorTail: parsed.data.errorTail,
  });

  await db()
    .update(podLifecycle)
    .set({
      metadata,
      lastHeartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(podLifecycle.id, pod.id));

  if (pod.experimentId) {
    const experimentRows = await db()
      .select({ planJson: experiments.planJson })
      .from(experiments)
      .where(eq(experiments.id, pod.experimentId))
      .limit(1);
    const experiment = experimentRows[0];
    if (experiment) {
      const message = parsed.data.message ?? parsed.data.status;
      await db()
        .update(experiments)
        .set({
          planJson: mergeExperimentProgress(experiment.planJson, {
            source: 'pod',
            podId: pod.runpodPodId,
            remainingMinutes: parsed.data.estimatedRemainingMinutes,
            message: message === undefined ? undefined : message,
            progressPct: parsed.data.progressPct,
          }),
          updatedAt: now,
        })
        .where(eq(experiments.id, pod.experimentId));
    }
    await db().insert(workflowEvents).values({
      entityKind: 'experiment',
      entityId: pod.experimentId,
      eventType: 'note',
      actorKind: 'runpod',
      note: progressBody(parsed.data),
      metadata: {
        marker_type: 'epm:progress',
        podId: pod.runpodPodId,
        estimatedRemainingMinutes: parsed.data.estimatedRemainingMinutes ?? null,
        progressPct: parsed.data.progressPct ?? null,
        status: parsed.data.status ?? null,
        errorTail: parsed.data.errorTail ?? null,
      },
    });
  }

  if (pod.agentRunId) {
    await db().insert(agentRunEvents).values({
      runId: pod.agentRunId,
      eventType: 'runpod_progress',
      body: progressBody(parsed.data),
      metadata: {
        podId: pod.runpodPodId,
        estimatedRemainingMinutes: parsed.data.estimatedRemainingMinutes ?? null,
        progressPct: parsed.data.progressPct ?? null,
        status: parsed.data.status ?? null,
        errorTail: parsed.data.errorTail ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true, podId: pod.runpodPodId });
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization');
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function progressBody(progress: z.infer<typeof progressSchema>) {
  const parts: string[] = [];
  if (progress.progressPct != null) parts.push(`${progress.progressPct.toFixed(progress.progressPct % 1 === 0 ? 0 : 1)}%`);
  if (progress.estimatedRemainingMinutes != null) parts.push(`${progress.estimatedRemainingMinutes}m remaining`);
  if (progress.status) parts.push(progress.status);
  if (progress.message) parts.push(progress.message);
  if (progress.errorTail) {
    // Surface a short, single-line tail of the failure so the dashboard's
    // event timeline shows useful information without needing to dig into
    // metadata. The full tail (up to 16KB) is preserved in event metadata.
    const lastLine = progress.errorTail
      .split('\n')
      .reverse()
      .find((line) => line.trim().length > 0);
    if (lastLine) parts.push(`err: ${lastLine.slice(0, 200)}`);
  }
  return parts.join(' · ') || 'pod progress update';
}

function mergeProgressMetadata(metadata: unknown, progress: JsonRecord) {
  const base: JsonRecord = isRecord(metadata) ? { ...metadata } : {};
  const existing = isRecord(base.saganProgress) ? base.saganProgress : {};
  base.saganProgress = {
    ...existing,
    ...Object.fromEntries(Object.entries(progress).filter(([, value]) => value !== undefined)),
    source: 'pod',
  };
  return base;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
