'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface Entry {
  id: string;
  kind: 'clean_result' | 'blocker' | 'decision' | 'note';
  bodyMd: string;
  createdAt: string;
}

const KIND_BADGES: Record<Entry['kind'], { label: string; bg: string }> = {
  clean_result: { label: 'result', bg: 'oklch(0.86 0.13 150)' },
  blocker: { label: 'blocker', bg: 'oklch(0.86 0.13 25)' },
  decision: { label: 'decision', bg: 'oklch(0.86 0.13 250)' },
  note: { label: 'note', bg: 'oklch(0.88 0.04 270)' },
};

export function ResearchLog({ day, initialEntries }: { day: string; initialEntries: Entry[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Entry['kind']>('note');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/daily-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, bodyMd: body, day }),
      });
      if (res.ok) {
        setBody('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function archive(id: string) {
    await fetch(`/api/daily-log/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
        Research log
      </h2>

      <form onSubmit={onSubmit} className="flex gap-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Entry['kind'])}
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
        >
          <option value="note">note</option>
          <option value="clean_result">clean result</option>
          <option value="blocker">blocker</option>
          <option value="decision">decision</option>
        </select>
        <input
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add an entry…"
          className="flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {initialEntries.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">Nothing logged yet today.</p>
        ) : (
          initialEntries.slice().reverse().map((entry) => {
            const badge = KIND_BADGES[entry.kind];
            return (
              <div key={entry.id} className="group flex items-baseline gap-3 p-3 text-sm">
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{ background: badge.bg, color: 'oklch(0.20 0.04 270)' }}
                >
                  {badge.label}
                </span>
                <span className="flex-1 whitespace-pre-wrap">{entry.bodyMd}</span>
                <span className="text-xs text-[--color-muted]">
                  {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  type="button"
                  onClick={() => archive(entry.id)}
                  className="rounded text-xs text-[--color-muted] opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
                >
                  archive
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
