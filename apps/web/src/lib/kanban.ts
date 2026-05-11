import { asc, eq, inArray, isNull, and } from 'drizzle-orm';
import { kanbanCards, kanbanColumns, todos, type KanbanCard, type KanbanColumn } from '@sagan/db/schema';
import { db } from './db';

const DEFAULT_BOARD = 'next-steps';

const DEFAULT_COLUMNS = [
  { title: 'Backlog', position: 0, color: 'var(--color-muted)' },
  { title: 'Today', position: 1, color: 'var(--color-info)' },
  { title: 'Doing', position: 2, color: 'var(--color-running)' },
  { title: 'Awaiting result', position: 3, color: 'var(--color-approval)' },
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
  let cards = await db()
    .select()
    .from(kanbanCards)
    .where(and(...[isNull(kanbanCards.archivedAt)]))
    .orderBy(asc(kanbanCards.position));
  // Filter cards to those whose column belongs to this board.
  const columnIds = new Set(columns.map((c) => c.id));
  cards = cards.filter((c) => columnIds.has(c.columnId));
  if (await ensureTodoLinks(cards)) {
    cards = await db()
      .select()
      .from(kanbanCards)
      .where(and(...[isNull(kanbanCards.archivedAt)]))
      .orderBy(asc(kanbanCards.position));
    cards = cards.filter((c) => columnIds.has(c.columnId));
  }

  return {
    slug,
    columns,
    cards: await mergeLinkedTodoFields(cards),
  };
}

export function todoStatusForColumn(column: Pick<KanbanColumn, 'title'>) {
  const title = column.title.toLowerCase();
  if (title.includes('doing')) return 'in_progress';
  if (title.includes('await')) return 'running';
  if (title.includes('backlog')) return 'open';
  return 'open';
}

async function ensureTodoLinks(cards: KanbanCard[]) {
  let changed = false;
  for (const card of cards) {
    if (card.linkedKind === 'todo' && card.linkedId) continue;
    const inserted = await db()
      .insert(todos)
      .values({
        text: card.title,
        bodyMd: card.bodyMd,
        status: 'open',
        priority: 'normal',
      })
      .returning({ id: todos.id });
    const todo = inserted[0];
    if (!todo) continue;
    await db()
      .update(kanbanCards)
      .set({ linkedKind: 'todo', linkedId: todo.id, updatedAt: new Date() })
      .where(eq(kanbanCards.id, card.id));
    changed = true;
  }
  return changed;
}

async function mergeLinkedTodoFields(cards: KanbanCard[]) {
  const todoIds = cards
    .filter((card) => card.linkedKind === 'todo' && card.linkedId)
    .map((card) => card.linkedId!);
  if (todoIds.length === 0) return cards;
  const linkedTodos = await db()
    .select({ id: todos.id, text: todos.text, bodyMd: todos.bodyMd, status: todos.status })
    .from(todos)
    .where(inArray(todos.id, todoIds));
  const byId = new Map(linkedTodos.map((todo) => [todo.id, todo]));
  return cards.map((card) => {
    if (card.linkedKind !== 'todo' || !card.linkedId) return card;
    const todo = byId.get(card.linkedId);
    return todo
      ? {
          ...card,
          title: todo.text,
          bodyMd: todo.bodyMd,
        }
      : card;
  });
}
