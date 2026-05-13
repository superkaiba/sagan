import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { experiments } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { db } from '@/lib/db';

const schema = z.object({
  index: z.number().int().min(0).max(1000),
  answer: z.string().max(20_000),
});

// Merge a single per-question answer into experiments.plan_json.answers.
// Stored as { answers: { [index]: string } } alongside the existing sections
// so we don't have to add a column. The dispatch endpoint reads this map.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }

  const rows = await db()
    .select({ planJson: experiments.planJson })
    .from(experiments)
    .where(eq(experiments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const current = (row.planJson ?? {}) as Record<string, unknown>;
  const answers = (current.answers && typeof current.answers === 'object'
    ? { ...(current.answers as Record<string, unknown>) }
    : {}) as Record<string, string>;

  const key = String(parsed.data.index);
  if (parsed.data.answer.trim() === '') {
    delete answers[key];
  } else {
    answers[key] = parsed.data.answer;
  }

  const nextPlan = { ...current, answers };
  await db()
    .update(experiments)
    .set({ planJson: nextPlan, updatedAt: new Date() })
    .where(eq(experiments.id, id));

  return NextResponse.json({ ok: true });
}
