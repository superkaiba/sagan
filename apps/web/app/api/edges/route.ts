import { NextResponse } from 'next/server';
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { edges } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isEntityKind } from '@/lib/entity';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

const KIND_VALUES = [
  'project',
  'belief',
  'experiment',
  'run',
  'todo',
  'lit_item',
  'project_narrative',
] as const;
const TYPE_VALUES = [
  'parent',
  'child',
  'sibling',
  'supports',
  'contradicts',
  'derives_from',
  'cites',
  'tests',
  'produces_evidence_for',
  'blocks',
  'answers',
  'duplicates',
  'method',
  'baseline',
  'background',
  'threat',
  'inspiration',
] as const;

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const kind = url.searchParams.get('entityKind') ?? '';
  const id = url.searchParams.get('entityId') ?? '';
  if (!isEntityKind(kind)) {
    return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
  }
  const rows = await db()
    .select()
    .from(edges)
    .where(
      or(
        and(eq(edges.fromKind, kind), eq(edges.fromId, id)),
        and(eq(edges.toKind, kind), eq(edges.toId, id)),
      ),
    );
  const outgoing = rows.filter((r) => r.fromKind === kind && r.fromId === id);
  const incoming = rows.filter((r) => r.toKind === kind && r.toId === id);
  return NextResponse.json({ outgoing, incoming });
}

const createSchema = z.object({
  fromKind: z.enum(KIND_VALUES),
  fromId: z.string().uuid(),
  toKind: z.enum(KIND_VALUES),
  toId: z.string().uuid(),
  type: z.enum(TYPE_VALUES),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const inserted = await db()
    .insert(edges)
    .values(parsed.data)
    .onConflictDoNothing()
    .returning();
  const edge = inserted[0];
  await appendDailyLogTrailBestEffort({
    action: edge ? `Linked ${edge.fromKind} to ${edge.toKind}` : `Skipped duplicate link ${parsed.data.fromKind} to ${parsed.data.toKind}`,
    why: 'A user updated the research knowledge graph by recording a relationship.',
    entityKind: parsed.data.fromKind,
    entityId: parsed.data.fromId,
    detail: `${parsed.data.fromKind}:${parsed.data.fromId} --${parsed.data.type}--> ${parsed.data.toKind}:${parsed.data.toId}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: edge?.id ?? `${parsed.data.fromId}:${parsed.data.toId}:${parsed.data.type}`,
  });
  return NextResponse.json({ edge: inserted[0] ?? null });
}
