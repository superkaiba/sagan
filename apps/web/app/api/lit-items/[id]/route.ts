import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { litItems } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  readState: z.enum(['unread', 'queued', 'reading', 'read', 'archived']).optional(),
  queuePosition: z.number().int().optional(),
  title: z.string().min(1).max(500).optional(),
  abstract: z.string().max(20_000).optional(),
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
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  await db()
    .update(litItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(litItems.id, id));
  return NextResponse.json({ ok: true });
}
