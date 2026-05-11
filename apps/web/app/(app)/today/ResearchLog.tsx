'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/ui';

interface Entry {
  id: string;
  kind: 'clean_result' | 'blocker' | 'decision' | 'note';
  bodyMd: string;
  createdAt: string;
}

type LogMode = 'research' | 'all' | 'results' | 'trail';

const MODES: Array<{ key: LogMode; label: string }> = [
  { key: 'research', label: 'Research' },
  { key: 'all', label: 'All' },
  { key: 'results', label: 'Results' },
  { key: 'trail', label: 'Trail' },
];

const MODE_TITLES: Record<LogMode, string> = {
  research: 'Research entries',
  all: 'All entries',
  results: 'Clean results',
  trail: 'Action trail',
};

const MODE_EMPTY: Record<LogMode, string> = {
  research: 'No research entries yet today.',
  all: 'Nothing logged today.',
  results: 'No clean results yet.',
  trail: 'No action-trail entries yet.',
};

const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;

function isActionTrail(entry: Entry) {
  return ACTION_PREFIX_RE.test(entry.bodyMd);
}

function EntryRow({ entry }: { entry: Entry }) {
  return (
    <article className="group grid gap-2 p-3 text-sm hover:bg-[--color-muted-bg] md:grid-cols-[7rem_minmax(0,1fr)_auto] md:items-start">
      <div className="flex items-center gap-2 md:block">
        <StatusBadge status={entry.kind} />
        <time className="text-xs text-[--color-muted] md:mt-2 md:block">
          {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
      </div>
      <Link
        href={`/e/daily_log_entry/${entry.id}`}
        data-clickable="true"
        className="min-w-0 rounded-md px-1 -mx-1 hover:bg-[--color-hover]"
      >
        <Markdown className="[&_p:first-child]:mt-0 [&_p:last-child]:mb-0">
          {entry.bodyMd}
        </Markdown>
      </Link>
      <div className="flex gap-2 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:focus-within:opacity-100">
        <Link
          href={`/e/daily_log_entry/${entry.id}`}
          className="justify-self-start rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
        >
          open
        </Link>
        <ArchiveButton id={entry.id} />
      </div>
    </article>
  );
}

function ArchiveButton({ id }: { id: string }) {
  const router = useRouter();
  async function archive() {
    await fetch(`/api/daily-log/${id}`, { method: 'DELETE' });
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={archive}
      className="justify-self-start rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
    >
      archive
    </button>
  );
}

function LogList({
  mode,
  entries,
  count,
}: {
  mode: LogMode;
  entries: Entry[];
  count: number;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[--color-border] pb-2">
        <h3 className="text-base font-semibold tracking-tight">{MODE_TITLES[mode]}</h3>
        <span className="font-mono text-xs text-[--color-muted]">{count}</span>
      </div>
      <div className="divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-panel]">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">{MODE_EMPTY[mode]}</p>
        ) : (
          entries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
        )}
      </div>
    </section>
  );
}

export function ResearchLog({ day, initialEntries }: { day: string; initialEntries: Entry[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<LogMode>('research');
  const [kind, setKind] = useState<Entry['kind']>('note');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/daily-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, bodyMd: body, day }),
      });
      if (res.ok) {
        setBody('');
        router.refresh();
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not add entry');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const newest = initialEntries.slice().reverse();
  const cleanResults = newest.filter((entry) => entry.kind === 'clean_result');
  const actionTrail = newest.filter(isActionTrail);
  const researchEntries = newest.filter((entry) => entry.kind !== 'clean_result' && !isActionTrail(entry));
  const visibleEntries =
    mode === 'all' ? newest : mode === 'results' ? cleanResults : mode === 'trail' ? actionTrail : researchEntries;
  const counts: Record<LogMode, number> = {
    research: researchEntries.length,
    all: newest.length,
    results: cleanResults.length,
    trail: actionTrail.length,
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Daily log</h2>
        <div className="flex flex-wrap rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-1">
          {MODES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={`rounded-md px-2 py-1 text-xs ${
                mode === item.key
                  ? 'bg-[--color-bg] text-[--color-fg]'
                  : 'text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]'
              }`}
            >
              {item.label} <span className="font-mono">{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

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
          className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] hover:opacity-90 disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {error ? <p className="text-sm text-[--color-danger]">{error}</p> : null}

      <LogList mode={mode} entries={visibleEntries} count={counts[mode]} />
    </section>
  );
}
