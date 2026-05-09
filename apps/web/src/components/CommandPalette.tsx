'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Hit {
  kind: string;
  id: string;
  title: string;
  meta: string;
}

const KIND_LABEL: Record<string, string> = {
  project: 'Project',
  belief: 'Belief',
  experiment: 'Experiment',
  run: 'Run',
  todo: 'Task',
  lit_item: 'Paper',
  project_narrative: 'Narrative',
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { hits: Hit[] };
        setHits(data.hits);
        setActive(0);
      } catch {
        /* ignore */
      }
    }, 120);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  function navigate(hit: Hit) {
    setOpen(false);
    setQ('');
    router.push(`/e/${hit.kind}/${hit.id}`);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && hits[active]) {
      e.preventDefault();
      navigate(hits[active]);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/30 p-4 pt-[12vh] backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-lg border border-[--color-border] bg-[--color-bg] shadow-xl overflow-hidden"
      >
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search projects, beliefs, experiments, todos, papers…"
          className="w-full border-b border-[--color-border] bg-transparent px-4 py-3 text-sm focus:outline-none"
        />
        <div className="max-h-[50vh] overflow-y-auto">
          {hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[--color-muted]">
              {q.trim() ? 'No matches.' : 'Start typing to search.'}
            </p>
          ) : (
            <ul>
              {hits.map((hit, i) => (
                <li key={`${hit.kind}-${hit.id}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => navigate(hit)}
                    className={
                      'flex w-full items-baseline gap-3 px-4 py-2 text-left text-sm ' +
                      (i === active ? 'bg-[--color-muted-bg]' : '')
                    }
                  >
                    <span className="w-20 shrink-0 text-[10px] uppercase tracking-wide text-[--color-muted]">
                      {KIND_LABEL[hit.kind] ?? hit.kind}
                    </span>
                    <span className="flex-1 truncate">{hit.title}</span>
                    <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">
                      {hit.meta}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="flex items-center justify-between border-t border-[--color-border] bg-[--color-muted-bg] px-4 py-2 text-[10px] uppercase tracking-wide text-[--color-muted]">
          <span>↑↓ to nav · ↵ to open</span>
          <span>esc to close</span>
        </footer>
      </div>
    </div>
  );
}
