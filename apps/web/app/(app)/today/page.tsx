import { and, asc, eq, isNull } from 'drizzle-orm';
import { dailyLogEntries } from '@eps/db/schema';
import { db } from '@/lib/db';
import { loadBoard } from '@/lib/kanban';
import { ResearchLog } from './ResearchLog';
import { Kanban } from './Kanban';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [entries, board] = await Promise.all([
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, today), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt)),
    loadBoard('next-steps'),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-[--color-muted]">{today}</p>
      </header>

      <ResearchLog
        day={today}
        initialEntries={entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          bodyMd: e.bodyMd,
          createdAt: e.createdAt.toISOString(),
        }))}
      />

      <Kanban
        slug={board.slug}
        initialColumns={board.columns.map((c) => ({
          id: c.id,
          title: c.title,
          color: c.color,
          position: c.position,
        }))}
        initialCards={board.cards.map((c) => ({
          id: c.id,
          columnId: c.columnId,
          title: c.title,
          bodyMd: c.bodyMd,
          position: c.position,
        }))}
      />
    </div>
  );
}
