import { NextResponse } from 'next/server';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  cleanResults,
  cleanResultVersions,
  comments,
  dailyLogEntries,
  runArtifacts,
} from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  claim: z.string().min(1).max(1000).optional(),
  bodyMd: z.string().min(1).max(100_000).optional(),
  confidence: z.enum(['LOW', 'MODERATE', 'HIGH']).nullable().optional(),
  status: z.enum(['draft', 'reviewing', 'approved', 'archived', 'blocked']).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const result = await loadCleanResult(id);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const existingRows = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
  const existing = existingRows[0];
  if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (parsed.data.status === 'approved' && existing.artifactStatus !== 'verified') {
    return NextResponse.json({ error: 'verified_artifacts_required' }, { status: 409 });
  }

  const updates: Partial<typeof cleanResults.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.claim !== undefined) updates.claim = parsed.data.claim;
  if (parsed.data.bodyMd !== undefined) updates.bodyMd = parsed.data.bodyMd;
  if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === 'approved') {
      updates.approvedBy = session.user.id;
      updates.approvedAt = new Date();
    }
    if (parsed.data.status === 'archived') updates.archivedAt = new Date();
  }

  const updatedRows = await db()
    .update(cleanResults)
    .set(updates)
    .where(eq(cleanResults.id, id))
    .returning();
  const cleanResult = updatedRows[0]!;

  if (
    parsed.data.bodyMd !== undefined ||
    parsed.data.title !== undefined ||
    parsed.data.claim !== undefined ||
    parsed.data.confidence !== undefined
  ) {
    await db().insert(cleanResultVersions).values({
      cleanResultId: id,
      title: cleanResult.title,
      claim: cleanResult.claim,
      bodyMd: cleanResult.bodyMd,
      confidence: cleanResult.confidence,
      authorKind: 'user',
      editedBy: session.user.id,
    });
  }

  if (parsed.data.status === 'approved' && !cleanResult.sourceDailyLogEntryId) {
    const day = new Date().toISOString().slice(0, 10);
    const entry = await db()
      .insert(dailyLogEntries)
      .values({
        day,
        kind: 'clean_result',
        bodyMd: cleanResult.bodyMd,
        entityKind: 'clean_result',
        entityId: cleanResult.id,
      })
      .returning({ id: dailyLogEntries.id });
    await db()
      .update(cleanResults)
      .set({ sourceDailyLogEntryId: entry[0]!.id, updatedAt: new Date() })
      .where(eq(cleanResults.id, id));
  }

  await appendDailyLogTrailBestEffort({
    action: `Updated clean result ${id.slice(0, 8)}`,
    why: parsed.data.status === 'approved' ? 'The owner approved the verified clean result.' : 'The owner revised clean-result state or prose.',
    entityKind: 'clean_result',
    entityId: id,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: id,
  });

  const result = await loadCleanResult(id);
  return NextResponse.json(result);
}

async function loadCleanResult(id: string) {
  const rows = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
  const cleanResult = rows[0];
  if (!cleanResult) return null;
  const artifactFilters = [
    cleanResult.runId ? eq(runArtifacts.runId, cleanResult.runId) : undefined,
    cleanResult.agentRunId ? eq(runArtifacts.agentRunId, cleanResult.agentRunId) : undefined,
    cleanResult.experimentId ? eq(runArtifacts.experimentId, cleanResult.experimentId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const [versions, commentRows, artifacts] = await Promise.all([
    db()
      .select()
      .from(cleanResultVersions)
      .where(eq(cleanResultVersions.cleanResultId, id))
      .orderBy(desc(cleanResultVersions.createdAt)),
    db()
      .select()
      .from(comments)
      .where(and(eq(comments.entityKind, 'clean_result'), eq(comments.entityId, id)))
      .orderBy(comments.createdAt),
    artifactFilters.length
      ? db()
          .select()
          .from(runArtifacts)
          .where(artifactFilters.length === 1 ? artifactFilters[0]! : or(...artifactFilters))
          .orderBy(runArtifacts.createdAt)
      : Promise.resolve([]),
  ]);
  return { cleanResult, versions, comments: commentRows, artifacts };
}
