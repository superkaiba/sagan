import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOwner } from '@/lib/access';
import { generateIdeaCardDrafts } from '@/lib/ideation';

const createSchema = z.object({
  answer: z.string().max(10_000).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const cards = await generateIdeaCardDrafts(id, parsed.data.answer);
  if (!cards) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ cards });
}
