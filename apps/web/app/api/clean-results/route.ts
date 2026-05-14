import { NextResponse } from 'next/server';
import { desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { cleanResults, cleanResultVersions, runArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireOwner } from '@/lib/access';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';
import { grantDefaultMentorMembership } from '@/lib/default-memberships';

const createSchema = z.object({
  title: z.string().min(1).max(300),
  claim: z.string().min(1).max(1000),
  bodyMd: z.string().min(1).max(100_000),
  confidence: z.enum(['LOW', 'MODERATE', 'HIGH']).optional(),
  experimentId: z.string().uuid().optional(),
  runId: z.string().uuid().optional(),
  agentRunId: z.string().uuid().optional(),
  artifactIds: z.array(z.string().uuid()).min(1),
});

export async function GET() {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const rows = await db().select().from(cleanResults).orderBy(desc(cleanResults.updatedAt)).limit(100);
  return NextResponse.json({ cleanResults: rows });
}

export async function POST(req: Request) {
  let session;
  try {
    session = await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const artifactRows = await db()
    .select()
    .from(runArtifacts)
    .where(inArray(runArtifacts.id, parsed.data.artifactIds));
  if (artifactRows.length !== parsed.data.artifactIds.length) {
    return NextResponse.json({ error: 'artifact_not_found' }, { status: 400 });
  }
  const unverifiable = artifactRows.find((artifact) => !artifact.uri.trim());
  if (unverifiable) {
    return NextResponse.json({ error: 'artifact_unverifiable', artifactId: unverifiable.id }, { status: 409 });
  }

  await db()
    .update(runArtifacts)
    .set({ status: 'verified', verifiedAt: new Date(), updatedAt: new Date() })
    .where(inArray(runArtifacts.id, parsed.data.artifactIds));

  const inserted = await db()
    .insert(cleanResults)
    .values({
      title: parsed.data.title,
      claim: parsed.data.claim,
      bodyMd: parsed.data.bodyMd,
      confidence: parsed.data.confidence,
      experimentId: parsed.data.experimentId,
      runId: parsed.data.runId,
      agentRunId: parsed.data.agentRunId,
      artifactStatus: 'verified',
      status: 'draft',
    })
    .returning();
  const cleanResult = inserted[0]!;
  await db().insert(cleanResultVersions).values({
    cleanResultId: cleanResult.id,
    title: cleanResult.title,
    claim: cleanResult.claim,
    bodyMd: cleanResult.bodyMd,
    confidence: cleanResult.confidence,
    authorKind: 'user',
    editedBy: session.user.id,
  });
  await grantDefaultMentorMembership('clean_result', cleanResult.id, session.user.id);
  await appendDailyLogTrailBestEffort({
    action: `Drafted clean result ${cleanResult.id.slice(0, 8)}`,
    why: 'A verified artifact-backed clean result draft was created.',
    entityKind: 'clean_result',
    entityId: cleanResult.id,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: cleanResult.id,
  });

  return NextResponse.json({ cleanResult, verifiedArtifactIds: artifactRows.map((artifact) => artifact.id) });
}
