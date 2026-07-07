import { NextResponse } from 'next/server';
import { isEntityKind, loadEntity } from '@/lib/entity';

// Public read (2026-07-06): entity data is viewable without a session,
// matching the public entity pages.
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  if (!isEntityKind(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const row = await loadEntity(kind, id);
  if (!row) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ entity: row });
}
