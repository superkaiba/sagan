'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Markdown } from './Markdown';

interface Comment {
  id: string;
  entityKind: string;
  entityId: string;
  parentCommentId: string | null;
  authorUserId: string | null;
  authorKind: 'human' | 'claude' | 'system';
  kind: 'discussion' | 'ask_claude' | 'todo';
  body: string;
  agentRunId: string | null;
  autoContinueClaude: boolean;
  resolvedAt: string | null;
  resolvedSummaryMd: string | null;
  createdAt: string;
}

export function Comments({ entityKind, entityId }: { entityKind: string; entityId: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');

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

  async function postComment(text: string, parentCommentId?: string | null) {
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entityKind, entityId, body: text, parentCommentId }),
    });
    return res.ok;
  }

  async function onTopLevelSubmit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const ok = await postComment(body);
      if (ok) {
        setBody('');
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onReplySubmit(e: FormEvent, parentId: string) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    setSubmitting(true);
    try {
      const ok = await postComment(replyBody, parentId);
      if (ok) {
        setReplyBody('');
        setReplyTo(null);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
  }

  // Group comments by thread root (parent or self).
  const roots = items.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of items) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const visibleRoots = showResolved ? roots : roots.filter((r) => !r.resolvedAt);

  function renderComment(c: Comment, isReply = false) {
    const isClaude = c.authorKind === 'claude';
    const wrap = `group p-3 ${c.resolvedAt ? 'opacity-60' : ''} ${isClaude ? 'bg-[--color-muted-bg]' : ''} ${isReply ? 'border-l-2 border-[--color-border] ml-4' : ''}`;
    return (
      <article key={c.id} className={wrap}>
        <header className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-[--color-muted]">
          <span className={isClaude ? 'font-medium text-[--color-accent]' : 'font-medium text-[--color-fg]'}>
            {isClaude ? 'Claude' : c.authorKind === 'system' ? 'System' : 'You'}
          </span>
          <span>·</span>
          <time>{new Date(c.createdAt).toLocaleString()}</time>
          {c.kind === 'ask_claude' && c.agentRunId ? (
            <Link
              href={`/agent/${c.agentRunId}`}
              className="rounded-full bg-[--color-accent] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[--color-accent-fg]"
            >
              view run
            </Link>
          ) : null}
          {!isReply && c.autoContinueClaude ? (
            <span className="ml-auto rounded-md border border-[--color-border] bg-[--color-muted-bg] px-2 py-0.5 text-[10px] font-medium text-[--color-muted]">
              Claude auto-continues
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => patch(c.id, { resolved: !c.resolvedAt })}
            className="text-[10px] uppercase tracking-wide opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
          >
            {c.resolvedAt ? 'reopen' : 'resolve'}
          </button>
        </header>
        {c.resolvedAt && c.resolvedSummaryMd ? (
          <p className="mb-1 text-xs italic text-[--color-muted]">
            resolved · {c.resolvedSummaryMd}
          </p>
        ) : null}
        <Markdown>{c.body}</Markdown>
        <div className="mt-2">
          {replyTo === c.id ? (
            <form onSubmit={(e) => onReplySubmit(e, c.id)} className="space-y-1">
              <textarea
                rows={2}
                autoFocus
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Reply…"
                className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setReplyTo(null);
                    setReplyBody('');
                  }}
                  className="text-[--color-muted] hover:text-[--color-fg]"
                >
                  cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !replyBody.trim()}
                  className="rounded-md bg-[--color-accent] px-2 py-0.5 font-medium text-[--color-accent-fg] disabled:opacity-50"
                >
                  Reply
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setReplyTo(c.id)}
              className="text-xs text-[--color-muted] opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
            >
              reply
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Comments</h2>
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-[--color-muted] hover:text-[--color-fg]"
        >
          {showResolved ? 'Hide resolved' : 'Show resolved'}
        </button>
      </div>

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {visibleRoots.length === 0 ? (
          <p className="p-3 text-sm text-[--color-muted]">No comments yet.</p>
        ) : (
          visibleRoots.map((root) => (
            <div key={root.id}>
              {renderComment(root, false)}
              {(repliesByParent.get(root.id) ?? []).map((reply) => renderComment(reply, true))}
            </div>
          ))
        )}
      </div>

      <form onSubmit={onTopLevelSubmit} className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
        <textarea
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment. Mention @claude to spawn a Q&A run."
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-[--color-muted]">
            <kbd className="rounded border border-[--color-border] px-1 text-[10px]">@claude</kbd> starts Claude; replies in that thread continue automatically.
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
