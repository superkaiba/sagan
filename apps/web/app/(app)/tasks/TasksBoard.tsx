'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Status =
  | 'inbox'
  | 'scoped'
  | 'planning'
  | 'open'
  | 'in_progress'
  | 'running'
  | 'interpreting'
  | 'awaiting_promotion'
  | 'blocked'
  | 'done'
  | 'cancelled';

interface Todo {
  id: string;
  text: string;
  status: Status | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  due: string | null;
  updatedAt: string;
}

const COLUMNS: Array<{
  title: string;
  statuses: Status[];
  next?: Status;
}> = [
  { title: 'Inbox', statuses: ['inbox'], next: 'open' },
  { title: 'Planned', statuses: ['scoped', 'planning', 'open'], next: 'in_progress' },
  {
    title: 'Doing',
    statuses: ['in_progress', 'running', 'interpreting', 'awaiting_promotion', 'blocked'],
    next: 'done',
  },
  { title: 'Done', statuses: ['done'], next: undefined },
];

export function TasksBoard({ initialTodos }: { initialTodos: Todo[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);

  async function addTodo(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: draft, status: 'inbox' }),
      });
      if (res.ok) {
        setDraft('');
        router.refresh();
      }
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(id: string, status: Status) {
    await fetch(`/api/todos/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function archive(id: string) {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addTodo} className="flex gap-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New task…"
          className="flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <button
          type="submit"
          disabled={creating || !draft.trim()}
          className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = initialTodos.filter((t) =>
            col.statuses.includes(t.status as Status),
          );
          return (
            <div key={col.title} className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3 space-y-2">
              <header className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide">{col.title}</span>
                <span className="text-xs text-[--color-muted]">{items.length}</span>
              </header>
              <ul className="space-y-2">
                {items.map((t) => (
                  <li
                    key={t.id}
                    className="group rounded-md border border-[--color-border] bg-[--color-bg] p-2 text-sm space-y-1"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1 break-words">{t.text}</span>
                      <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                        {col.next ? (
                          <button
                            type="button"
                            onClick={() => setStatus(t.id, col.next!)}
                            className="rounded text-xs text-[--color-muted] hover:text-[--color-fg]"
                            title={`Move to ${col.next}`}
                          >
                            →
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => archive(t.id)}
                          className="rounded text-xs text-[--color-muted] hover:text-[--color-fg]"
                          title="Archive"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-[--color-muted]">
                      <span>{t.status}</span>
                      {t.priority !== 'normal' ? <span>· {t.priority}</span> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
