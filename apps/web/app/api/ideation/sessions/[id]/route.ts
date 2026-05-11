import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ideaCards, ideaSessions } from '@sagan/db/schema';
import { requireOwner } from '@/lib/access';
import { db } from '@/lib/db';

const patchSchema = z.object({
  notesMd: z.string().max(50_000).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sessions = await db().select().from(ideaSessions).where(eq(ideaSessions.id, id)).limit(1);
  const session = sessions[0];
  if (!session) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const cards = await db()
    .select()
    .from(ideaCards)
    .where(eq(ideaCards.sessionId, id))
    .orderBy(desc(ideaCards.createdAt));
  return NextResponse.json({ session, cards });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', detail: z.treeifyError(parsed.error) }, { status: 400 });
  }
  const updated = await db()
    .update(ideaSessions)
    .set({
      ...parsed.data,
      archivedAt: parsed.data.status === 'archived' ? new Date() : undefined,
      updatedAt: new Date(),
    })
    .where(eq(ideaSessions.id, id))
    .returning();
  if (!updated[0]) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ session: updated[0] });
}
