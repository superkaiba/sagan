'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Markdown } from './Markdown';
import { useDashboardLiveSignal } from '@/lib/use-dashboard-live-signal';

interface ProposedFollowUpComment {
  id: string;
  kind: 'discussion' | 'ask_claude' | 'todo';
  body: string;
  resolvedAt: string | null;
  resolvedSummaryMd: string | null;
  createdAt: string;
}

/**
 * Renders the kind='todo' comments attached to an experiment as a
 * "Proposed follow-ups" section, with a "Move to todo" button per item that
 * promotes the proposal into a row in the `todos` table and resolves the
 * source comment so it stops cluttering the list. The orchestrator's
 * follow-up-proposer pipeline (stage 9 of the experiment workflow) writes
 * these comments after the clean-result critic pair passes.
 */
export function ProposedFollowUps({ experimentId }: { experimentId: string }) {
  const [items, setItems] = useState<ProposedFollowUpComment[] | null>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?entityKind=experiment&entityId=${encodeURIComponent(experimentId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { comments: ProposedFollowUpComment[] };
      setItems(
        data.comments.filter((c) => c.kind === 'todo' && !c.resolvedAt),
      );
    } catch {
      // network — leave items as null/previous
    }
  }, [experimentId]);

  useEffect(() => {
    void load();
  }, [load]);

  useDashboardLiveSignal(() => {
    void load();
  });

  async function promote(comment: ProposedFollowUpComment) {
    setPromotingId(comment.id);
    setError(null);
    try {
      const titleLine = comment.body.split(/\r?\n/, 1)[0]?.replace(/^[#*\s-]+/, '').trim() ?? '';
      const text = titleLine.length > 0 ? titleLine.slice(0, 500) : comment.body.slice(0, 500);
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          bodyMd: comment.body,
          status: 'open',
          linkedKind: 'experiment',
          linkedId: experimentId,
          fromCommentId: comment.id,
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `${res.status} ${res.statusText}`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'promote failed');
    } finally {
      setPromotingId(null);
    }
  }

  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Proposed follow-ups
        </h2>
        <span className="text-[10px] text-[--color-muted]">
          {items.length} pending
        </span>
      </header>
      {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}
      <ul className="space-y-2">
        {items.map((c) => (
          <li
            key={c.id}
            className="space-y-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2"
          >
            <div className="text-sm text-[--color-fg]">
              <Markdown>{c.body}</Markdown>
            </div>
            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => void promote(c)}
                disabled={promotingId === c.id}
                className="inline-flex items-center gap-1 rounded-md bg-[--color-accent] px-2 py-1 font-medium text-[--color-accent-fg] disabled:opacity-50"
              >
                {promotingId === c.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                ) : null}
                Move to todo
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
