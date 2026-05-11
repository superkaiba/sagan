import { NextResponse } from 'next/server';
import { isEntityKind, loadEntity } from '@/lib/entity';
import { requireSession } from '@/lib/auth';
import { ForbiddenError, requireEntityRead } from '@/lib/access';

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { kind, id } = await ctx.params;
  if (!isEntityKind(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  try {
    await requireEntityRead(session, kind, id);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }
  const row = await loadEntity(kind, id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ entity: row });
}
