import { desc, ne } from 'drizzle-orm';
import { todos } from '@eps/db/schema';
import { db } from '@/lib/db';
import { TasksBoard } from './TasksBoard';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const rows = await db()
    .select()
    .from(todos)
    .where(ne(todos.status, 'archived'))
    .orderBy(desc(todos.updatedAt))
    .limit(500);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-[--color-muted]">{rows.length} active</p>
      </header>
      <TasksBoard
        initialTodos={rows.map((r) => ({
          id: r.id,
          text: r.text,
          status: r.status,
          priority: r.priority,
          due: r.due ? r.due.toISOString() : null,
          updatedAt: r.updatedAt.toISOString(),
        }))}
      />
    </div>
  );
}
