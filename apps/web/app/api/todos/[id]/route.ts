import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { todos } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const patchSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  status: z
    .enum([
      'inbox',
      'scoped',
      'planning',
      'open',
      'in_progress',
      'running',
      'interpreting',
      'awaiting_promotion',
      'blocked',
      'done',
      'cancelled',
      'archived',
    ])
    .optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
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
    .update(todos)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(todos.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  await db()
    .update(todos)
    .set({ status: 'archived', updatedAt: new Date() })
    .where(eq(todos.id, id));
  return NextResponse.json({ ok: true });
}
