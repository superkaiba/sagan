import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { projectNarratives } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  bodyMd: z.string().max(200_000).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const updates: Partial<typeof projectNarratives.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.bodyMd !== undefined) updates.bodyMd = parsed.data.bodyMd;
  if (parsed.data.status !== undefined) {
    updates.status = parsed.data.status;
    if (parsed.data.status === 'published') {
      updates.publishedAt = new Date();
    }
  }

  // If publishing, archive any other published narrative for the same project.
  let publishedProjectId: string | null = null;
  if (parsed.data.status === 'published') {
    const target = await db()
      .select({ projectId: projectNarratives.projectId })
      .from(projectNarratives)
      .where(eq(projectNarratives.id, id))
      .limit(1);
    if (target[0]) {
      publishedProjectId = target[0].projectId;
      await db()
        .update(projectNarratives)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(
          and(
            eq(projectNarratives.projectId, target[0].projectId),
            eq(projectNarratives.status, 'published'),
            ne(projectNarratives.id, id),
          ),
        );
    }
  }

  await db().update(projectNarratives).set(updates).where(eq(projectNarratives.id, id));
  if (parsed.data.status !== 'published') {
    await appendDailyLogTrailBestEffort({
      action: `Updated project narrative ${id.slice(0, 8)}`,
      why: parsed.data.status
        ? `Move the narrative workflow state to ${parsed.data.status}.`
        : 'A user edited the running project summary draft.',
      entityKind: publishedProjectId ? 'project' : 'project_narrative',
      entityId: publishedProjectId ?? id,
      detail: `Fields: ${Object.keys(parsed.data).join(', ') || '(none)'}`,
      actorKind: 'user',
      actorUserId: session.user.id,
      correlationId: id,
    });
  }
  if (parsed.data.status === 'published') {
    await appendDailyLogTrailBestEffort({
      action: `Published project narrative ${id.slice(0, 8)}`,
      why: 'Promote the draft running summary into the mentor-visible/current project summary.',
      entityKind: publishedProjectId ? 'project' : 'project_narrative',
      entityId: publishedProjectId ?? id,
      actorKind: 'user',
      actorUserId: session.user.id,
      correlationId: id,
    });
  }
  return NextResponse.json({ ok: true });
}
