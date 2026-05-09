'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Markdown } from './Markdown';

interface Comment {
  id: string;
  entityKind: string;
  entityId: string;
  authorUserId: string | null;
  authorKind: 'human' | 'claude' | 'system';
  kind: 'discussion' | 'ask_claude' | 'todo';
  body: string;
  agentRunId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export function Comments({
  entityKind,
  entityId,
}: {
  entityKind: string;
  entityId: string;
}) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  async function load() {
    const res = await fetch(
      `/api/comments?entityKind=${encodeURIComponent(entityKind)}&entityId=${encodeURIComponent(entityId)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { comments: Comment[] };
    setItems(data.comments);
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKind, entityId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityKind, entityId, body }),
      });
      if (res.ok) {
        setBody('');
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resolve(id: string, resolved: boolean) {
    await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resolved }),
    });
    await load();
  }

  const visible = showResolved ? items : items.filter((c) => !c.resolvedAt);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Comments
        </h2>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-[--color-muted] hover:text-[--color-fg]"
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {visible.length === 0 ? (
          <p className="p-3 text-sm text-[--color-muted]">No comments yet.</p>
        ) : (
          visible.map((c) => (
            <article
              key={c.id}
              className={
                'group p-3 ' +
                (c.resolvedAt ? 'opacity-60' : '') +
                (c.authorKind === 'claude' ? ' bg-[--color-muted-bg]' : '')
              }
            >
              <header className="mb-1 flex items-baseline gap-2 text-xs text-[--color-muted]">
                <span className={c.authorKind === 'claude' ? 'font-medium text-[--color-accent]' : 'font-medium text-[--color-fg]'}>
                  {c.authorKind === 'claude' ? 'Claude' : c.authorKind === 'system' ? 'System' : 'You'}
                </span>
                <span>·</span>
                <time>{new Date(c.createdAt).toLocaleString()}</time>
                {c.kind === 'ask_claude' && c.agentRunId ? (
                  <Link
                    href={`/agent/${c.agentRunId}`}
                    className="ml-2 rounded-full bg-[--color-accent] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[--color-accent-fg]"
                  >
                    view run
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => resolve(c.id, !c.resolvedAt)}
                  className="ml-auto text-[10px] uppercase tracking-wide opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
                >
                  {c.resolvedAt ? 'reopen' : 'resolve'}
                </button>
              </header>
              <Markdown>{c.body}</Markdown>
            </article>
          ))
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment. Mention @claude to spawn a Q&A run."
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-[--color-muted]">
            Markdown supported. <kbd className="rounded border border-[--color-border] px-1 text-[10px]">@claude</kbd> dispatches an agent run.
          </p>
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
          >
            {submitting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </form>
    </section>
  );
}
