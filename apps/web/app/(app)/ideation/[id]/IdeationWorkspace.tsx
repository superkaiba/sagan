'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Card = {
  id: string;
  title: string;
  bodyMd: string;
  state: string;
  promotionKind: string | null;
  promotedKind: string | null;
  promotedId: string | null;
};

const PROMOTIONS = [
  { value: 'experiment', label: 'Experiment' },
  { value: 'belief_update', label: 'Belief update' },
  { value: 'literature_task', label: 'Literature task' },
  { value: 'clean_result_question', label: 'Clean-result question' },
] as const;

export function IdeationWorkspace({
  sessionId,
  initialNotes,
  promptDeck,
  cards,
}: {
  sessionId: string;
  initialNotes: string;
  promptDeck: string[];
  cards: Card[];
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<Record<string, string>>({});

  async function saveNotes() {
    setBusy('notes');
    setError(null);
    try {
      const res = await fetch(`/api/ideation/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ notesMd: notes }),
      });
      if (!res.ok) setError('save_failed');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function generateCards() {
    setBusy('cards');
    setError(null);
    try {
      const res = await fetch(`/api/ideation/sessions/${sessionId}/cards`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: answer.trim() || undefined }),
      });
      if (!res.ok) {
        setError('generate_failed');
        return;
      }
      setAnswer('');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function promote(cardId: string) {
    const target = targets[cardId] ?? 'experiment';
    setBusy(cardId);
    setError(null);
    try {
      const res = await fetch(`/api/ideation/cards/${cardId}/promote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        promotedKind?: string;
        promotedId?: string;
        error?: string;
      };
      if (!res.ok || !data.promotedKind || !data.promotedId) {
        setError(data.error ?? 'promote_failed');
        return;
      }
      router.push(data.promotedKind === 'experiment' ? `/e/experiment/${data.promotedId}` : `/e/todo/${data.promotedId}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]">
        <div className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Prompt me</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {promptDeck.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setAnswer((prev) => (prev ? `${prev}\n\n${prompt}\n` : `${prompt}\n`))}
                className="rounded-md border border-[--color-border] bg-[--color-bg] p-2 text-left text-sm hover:bg-[--color-panel]"
              >
                {prompt}
              </button>
            ))}
          </div>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="Direction"
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
          <button
            type="button"
            onClick={generateCards}
            disabled={busy !== null}
            className="rounded-md bg-[--color-accent] px-4 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
          >
            {busy === 'cards' ? 'Generating...' : 'Generate idea cards'}
          </button>
        </div>

        <div className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Session notes</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={10}
            placeholder="Notes"
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
          <button
            type="button"
            onClick={saveNotes}
            disabled={busy !== null}
            className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm hover:bg-[--color-panel] disabled:opacity-50"
          >
            {busy === 'notes' ? 'Saving...' : 'Save notes'}
          </button>
        </div>
      </section>

      {error ? <p className="text-sm text-[--color-danger]">{error}</p> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Idea cards</h2>
          <span className="text-xs text-[--color-muted]">{cards.length}</span>
        </div>
        {cards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
            No cards yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <article key={card.id} className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-medium">{card.title}</h3>
                    <span className="rounded-full bg-[--color-bg] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                      {card.state}
                    </span>
                  </div>
                  <p className="line-clamp-6 whitespace-pre-wrap text-sm text-[--color-muted]">{card.bodyMd}</p>
                </div>
                {card.state === 'promoted' && card.promotedKind && card.promotedId ? (
                  <a
                    href={`/e/${card.promotedKind}/${card.promotedId}`}
                    className="text-xs text-[--color-accent] hover:underline"
                  >
                    Open promoted record
                  </a>
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={targets[card.id] ?? 'experiment'}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [card.id]: e.target.value }))}
                      className="min-w-0 flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1.5 text-xs"
                    >
                      {PROMOTIONS.map((target) => (
                        <option key={target.value} value={target.value}>{target.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => promote(card.id)}
                      disabled={busy !== null}
                      className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
                    >
                      {busy === card.id ? 'Promoting...' : 'Promote'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
