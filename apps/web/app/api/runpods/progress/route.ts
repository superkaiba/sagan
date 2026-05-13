import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { agentRunEvents, experiments, podLifecycle } from '@sagan/db/schema';
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
  })
  .refine(
    (value) =>
      value.estimatedRemainingMinutes !== undefined ||
      value.progressPct !== undefined ||
      value.status !== undefined ||
      value.message !== undefined,
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
