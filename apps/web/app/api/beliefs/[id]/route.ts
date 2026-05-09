import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { beliefs, beliefVersions } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  currentBelief: z.string().max(50_000).optional(),
  motivation: z.string().max(50_000).optional(),
  evidence: z.string().max(50_000).optional(),
  counterevidence: z.string().max(50_000).optional(),
  topic: z.string().max(120).optional(),
  confidence: z.enum(['LOW', 'MODERATE', 'HIGH']).optional(),
  status: z
    .enum(['draft', 'active', 'supported', 'weakened', 'falsified', 'retracted', 'archived'])
    .optional(),
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

  // Snapshot the existing row before mutating, so /e/belief/[id]/history is real.
  const before = await db().select().from(beliefs).where(eq(beliefs.id, id)).limit(1);
  if (before[0]) {
    await db().insert(beliefVersions).values({
      beliefId: id,
      snapshot: before[0],
      editedBy: session.user.id,
    });
  }
  await db()
    .update(beliefs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(beliefs.id, id));
  return NextResponse.json({ ok: true });
}
