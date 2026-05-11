import { NextResponse } from 'next/server';
import { z } from 'zod';
import { kanbanCards, kanbanColumns, todos } from '@sagan/db/schema';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { loadBoard, todoStatusForColumn } from '@/lib/kanban';
import { appendDailyLogTrailBestEffort } from '@/lib/daily-log-trail';

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
  // Confirm the column exists.
  const col = await db()
    .select({ id: kanbanColumns.id, title: kanbanColumns.title })
    .from(kanbanColumns)
    .where(eq(kanbanColumns.id, parsed.data.columnId))
    .limit(1);
  const column = col[0];
  if (!column) {
    return NextResponse.json({ error: 'column_not_found' }, { status: 404 });
  }
  // Append at the end: position = (max + 1).
  const positions = await db()
    .select({ position: kanbanCards.position })
    .from(kanbanCards)
    .where(eq(kanbanCards.columnId, parsed.data.columnId));
  const nextPos = positions.reduce((m, r) => Math.max(m, r.position), -1) + 1;
  const todoRows = await db()
    .insert(todos)
    .values({
      text: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      status: todoStatusForColumn(column),
      priority: 'normal',
    })
    .returning({ id: todos.id });
  const todo = todoRows[0]!;
  const inserted = await db()
    .insert(kanbanCards)
    .values({
      columnId: parsed.data.columnId,
      title: parsed.data.title,
      bodyMd: parsed.data.bodyMd,
      linkedKind: 'todo',
      linkedId: todo.id,
      position: nextPos,
    })
    .returning();
  const card = inserted[0]!;
  await appendDailyLogTrailBestEffort({
    action: `Created kanban card ${card.title}`,
    why: 'A user added a next-step card to the workflow board.',
    detail: `columnId=${card.columnId}; position=${card.position}`,
    actorKind: 'user',
    actorUserId: session.user.id,
    correlationId: card.id,
  });
  return NextResponse.json({ card: inserted[0] });
}
