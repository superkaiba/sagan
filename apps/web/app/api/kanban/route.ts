import { NextResponse } from 'next/server';
import { z } from 'zod';
import { kanbanCards, kanbanColumns } from '@sagan/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { loadBoard } from '@/lib/kanban';

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get('board') ?? 'next-steps';
  const board = await loadBoard(slug);
  return NextResponse.json(board);
}

const createSchema = z.object({
  columnId: z.string().uuid(),
  title: z.string().min(1).max(500),
  bodyMd: z.string().max(20_000).optional(),
});

export async function POST(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  // Confirm the column exists.
  const col = await db()
    .select({ id: kanbanColumns.id })
    .from(kanbanColumns)
    .where(eq(kanbanColumns.id, parsed.data.columnId))
    .limit(1);
  if (col.length === 0) {
    return NextResponse.json({ error: 'column_not_found' }, { status: 404 });
  }
  // Append at the end: position = (max + 1).
  const positions = await db()
    .select({ position: kanbanCards.position })
    .from(kanbanCards)
    .where(eq(kanbanCards.columnId, parsed.data.columnId));
  const nextPos = positions.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  const inserted = await db()
    .insert(kanbanCards)
    .values({
      columnId: parsed.data.columnId,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      position: nextPos,
    })
    .returning();
  return NextResponse.json({ card: inserted[0] });
}
