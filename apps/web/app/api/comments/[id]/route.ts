import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { comments } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  body: z.string().min(1).max(10_000).optional(),
  resolved: z.boolean().optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const updates: Partial<typeof comments.$inferInsert> = { updatedAt: new Date() };
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.resolved === true) {
    updates.resolvedAt = new Date();
    updates.resolvedBy = session.user.id;
  } else if (parsed.data.resolved === false) {
    updates.resolvedAt = null;
    updates.resolvedBy = null;
  }
  await db().update(comments).set(updates).where(eq(comments.id, id));
  return NextResponse.json({ ok: true });
}
