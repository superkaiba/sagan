import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { projectNarratives } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  bodyMd: z.string().max(200_000).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
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
  if (parsed.data.status === 'published') {
    const target = await db()
      .select({ projectId: projectNarratives.projectId })
      .from(projectNarratives)
      .where(eq(projectNarratives.id, id))
      .limit(1);
    if (target[0]) {
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
  return NextResponse.json({ ok: true });
}
