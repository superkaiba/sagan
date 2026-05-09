'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface KCol {
  id: string;
  title: string;
  color: string | null;
  position: number;
}
interface KCard {
  id: string;
  columnId: string;
  title: string;
  bodyMd: string | null;
  position: number;
}

export function Kanban({
  slug,
  initialColumns,
  initialCards,
}: {
  slug: string;
  initialColumns: KCol[];
  initialCards: KCard[];
}) {
  const router = useRouter();
  const sortedColumns = [...initialColumns].sort((a, b) => a.position - b.position);
  const cardsByColumn = new Map<string, KCard[]>();
  for (const col of sortedColumns) cardsByColumn.set(col.id, []);
  for (const card of initialCards) {
    const arr = cardsByColumn.get(card.columnId);
    if (arr) arr.push(card);
  }
  for (const arr of cardsByColumn.values()) arr.sort((a, b) => a.position - b.position);

  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  async function addCard(e: FormEvent, columnId: string) {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    await fetch('/api/kanban', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columnId, title: draftTitle }),
    });
    setDraftTitle('');
    setCreatingIn(null);
    router.refresh();
  }

  async function moveCard(cardId: string, columnId: string) {
    await fetch(`/api/kanban/${cardId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ columnId, position: 9999 }),
    });
    router.refresh();
  }

  async function archiveCard(cardId: string) {
    await fetch(`/api/kanban/${cardId}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
        Next steps {slug !== 'next-steps' ? `(${slug})` : null}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {sortedColumns.map((col, idx) => {
          const cards = cardsByColumn.get(col.id) ?? [];
          const nextCol = sortedColumns[idx + 1];
          return (
            <div key={col.id} className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3 space-y-2">
              <header className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: col.color ?? 'currentColor' }}
                  />
                  {col.title}
                </span>
                <span className="text-xs text-[--color-muted]">{cards.length}</span>
              </header>
              <ul className="space-y-2">
                {cards.map((card) => (
                  <li
                    key={card.id}
                    className="group rounded-md border border-[--color-border] bg-[--color-bg] p-2 text-sm"
                  >
                    <div className="flex items-start gap-2">
                      <span className="flex-1">{card.title}</span>
                      <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                        {nextCol ? (
                          <button
                            type="button"
                            onClick={() => moveCard(card.id, nextCol.id)}
                            className="rounded text-xs text-[--color-muted] hover:text-[--color-fg]"
                            title={`Move to ${nextCol.title}`}
                          >
                            →
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => archiveCard(card.id)}
                          className="rounded text-xs text-[--color-muted] hover:text-[--color-fg]"
                          title="Archive"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {creatingIn === col.id ? (
                <form onSubmit={(e) => addCard(e, col.id)} className="space-y-1">
                  <input
                    autoFocus
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    onBlur={() => { if (!draftTitle.trim()) setCreatingIn(null); }}
                    placeholder="Card title"
                    className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreatingIn(col.id)}
                  className="w-full rounded-md border border-dashed border-[--color-border] py-1 text-xs text-[--color-muted] hover:border-[--color-fg] hover:text-[--color-fg]"
                >
                  + Add card
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
