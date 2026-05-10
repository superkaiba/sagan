import { asc, eq, isNull, and } from 'drizzle-orm';
import { kanbanCards, kanbanColumns } from '@sagan/db/schema';
import { db } from './db';

const DEFAULT_BOARD = 'next-steps';

const DEFAULT_COLUMNS = [
  { title: 'Backlog', position: 0, color: 'oklch(0.85 0.02 270)' },
  { title: 'Today', position: 1, color: 'oklch(0.85 0.10 250)' },
  { title: 'Doing', position: 2, color: 'oklch(0.85 0.10 90)' },
  { title: 'Awaiting result', position: 3, color: 'oklch(0.85 0.12 50)' },
];

export async function ensureDefaultBoard(slug: string = DEFAULT_BOARD): Promise<string> {
  const existing = await db()
    .select()
    .from(kanbanColumns)
    .where(eq(kanbanColumns.boardSlug, slug))
    .limit(1);
  if (existing.length > 0) return slug;
  await db()
    .insert(kanbanColumns)
    .values(DEFAULT_COLUMNS.map((c) => ({ ...c, boardSlug: slug })));
  return slug;
}

export async function loadBoard(slug: string = DEFAULT_BOARD) {
  await ensureDefaultBoard(slug);
  const columns = await db()
    .select()
    .from(kanbanColumns)
    .where(eq(kanbanColumns.boardSlug, slug))
    .orderBy(asc(kanbanColumns.position));
  if (columns.length === 0) return { slug, columns: [], cards: [] };
  const cards = await db()
    .select()
    .from(kanbanCards)
    .where(and(...[isNull(kanbanCards.archivedAt)]))
    .orderBy(asc(kanbanCards.position));
  // Filter cards to those whose column belongs to this board.
  const columnIds = new Set(columns.map((c) => c.id));
  return {
    slug,
    columns,
    cards: cards.filter((c) => columnIds.has(c.columnId)),
  };
}
