'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const TYPES = [
  'supports',
  'contradicts',
  'derives_from',
  'cites',
  'tests',
  'produces_evidence_for',
  'blocks',
  'answers',
  'duplicates',
  'method',
  'baseline',
  'background',
  'threat',
  'inspiration',
  'parent',
  'child',
  'sibling',
] as const;

const KIND_LABELS: Record<string, string> = {
  project: 'Project',
  belief: 'Belief',
  experiment: 'Experiment',
  run: 'Run',
  todo: 'Task',
  lit_item: 'Paper',
  project_narrative: 'Narrative',
};

interface Edge {
  id: string;
  fromKind: string;
  fromId: string;
  toKind: string;
  toId: string;
  type: string;
  note: string | null;
}

interface SearchHit {
  kind: string;
  id: string;
  title: string;
  meta: string;
}

export function EntityEdges({
  entityKind,
  entityId,
}: {
  entityKind: string;
  entityId: string;
}) {
  const router = useRouter();
  const [outgoing, setOutgoing] = useState<Edge[]>([]);
  const [incoming, setIncoming] = useState<Edge[]>([]);
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]>('supports');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});

  async function load() {
    const res = await fetch(`/api/edges?entityKind=${entityKind}&entityId=${entityId}`);
    if (!res.ok) return;
    const data = (await res.json()) as { outgoing: Edge[]; incoming: Edge[] };
    setOutgoing(data.outgoing);
    setIncoming(data.incoming);
    // Resolve titles for the other endpoints.
    const otherEnds = new Set<string>();
    for (const e of [...data.outgoing, ...data.incoming]) {
      const otherKind = e.fromKind === entityKind && e.fromId === entityId ? e.toKind : e.fromKind;
      const otherId = e.fromKind === entityKind && e.fromId === entityId ? e.toId : e.fromId;
      otherEnds.add(`${otherKind}:${otherId}`);
    }
    const fetched: Record<string, string> = {};
    await Promise.all(
      Array.from(otherEnds).map(async (k) => {
        const [kind, id] = k.split(':');
        try {
          const r = await fetch(`/api/entity/${kind}/${id}`);
          if (!r.ok) return;
          const d = (await r.json()) as { entity: { title: string } };
          fetched[k] = d.entity.title;
        } catch {
          /* ignore */
        }
      }),
    );
    setTitles((prev) => ({ ...prev, ...fetched }));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKind, entityId]);

  useEffect(() => {
    if (!adding || !q.trim()) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
      if (!res.ok) return;
      const data = (await res.json()) as { hits: SearchHit[] };
      setHits(data.hits.filter((h) => !(h.kind === entityKind && h.id === entityId)));
    }, 120);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [q, adding, entityKind, entityId]);

  async function createEdge(target: SearchHit) {
    await fetch('/api/edges', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fromKind: entityKind,
        fromId: entityId,
        toKind: target.kind,
        toId: target.id,
        type,
      }),
    });
    setQ('');
    setHits([]);
    setAdding(false);
    await load();
    router.refresh();
  }

  async function removeEdge(id: string) {
    await fetch(`/api/edges/${id}`, { method: 'DELETE' });
    await load();
  }

  function renderEdge(e: Edge, dir: 'in' | 'out') {
    const otherKind = dir === 'out' ? e.toKind : e.fromKind;
    const otherId = dir === 'out' ? e.toId : e.fromId;
    const title = titles[`${otherKind}:${otherId}`] ?? otherId.slice(0, 8);
    return (
      <li key={e.id} className="group flex items-baseline gap-2 px-3 py-1.5 text-sm">
        <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-[10px] uppercase tracking-wide">
          {dir === 'out' ? '→ ' : '← '}{e.type}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">
          {KIND_LABELS[otherKind] ?? otherKind}
        </span>
        <Link href={`/e/${otherKind}/${otherId}`} className="flex-1 truncate hover:underline">
          {title}
        </Link>
        <button
          type="button"
          onClick={() => removeEdge(e.id)}
          className="text-xs text-[--color-muted] opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
        >
          remove
        </button>
      </li>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Related records
        </h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="text-xs text-[--color-muted] hover:text-[--color-fg]"
        >
          {adding ? 'cancel' : '+ link'}
        </button>
      </div>

      {adding ? (
        <div className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[--color-muted]">this {entityKind}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
              className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search target…"
              className="flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
            />
          </div>
          {hits.length > 0 ? (
            <ul className="rounded-md border border-[--color-border] divide-y divide-[--color-border] bg-[--color-bg]">
              {hits.slice(0, 8).map((h) => (
                <li key={`${h.kind}:${h.id}`}>
                  <button
                    type="button"
                    onClick={() => createEdge(h)}
                    className="flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-xs hover:bg-[--color-muted-bg]"
                  >
                    <span className="w-16 shrink-0 uppercase tracking-wide text-[--color-muted]">
                      {KIND_LABELS[h.kind] ?? h.kind}
                    </span>
                    <span className="flex-1 truncate">{h.title}</span>
                    <span className="text-[--color-muted]">{h.meta}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {outgoing.length === 0 && incoming.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[--color-muted]">No links yet.</p>
        ) : (
          <>
            {outgoing.map((e) => renderEdge(e, 'out'))}
            {incoming.map((e) => renderEdge(e, 'in'))}
          </>
        )}
      </div>
    </section>
  );
}
