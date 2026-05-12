import { NextResponse } from 'next/server';
import { revokeApiToken } from '@sagan/auth';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const ok = await revokeApiToken(db(), session.user.id, id);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
