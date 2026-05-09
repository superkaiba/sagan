import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { projects } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summaryMd: z.string().max(50_000).optional(),
  status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
  public: z.boolean().optional(),
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
  await db()
    .update(projects)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(projects.id, id));
  return NextResponse.json({ ok: true });
}
