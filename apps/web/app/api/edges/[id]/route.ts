import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { edges } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  await db().delete(edges).where(eq(edges.id, id));
  return NextResponse.json({ ok: true });
}
