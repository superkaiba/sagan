'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Markdown } from './Markdown';
import { useDashboardLiveSignal } from '@/lib/use-dashboard-live-signal';

type ExperimentReviewStatus = 'reviewing' | 'followups_running';

interface FollowupComment {
  id: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface ImproveStatus {
  unresolvedCommentCount: number;
  pendingRunId: string | null;
}

interface RowSelection {
  quick: boolean;
  todo: boolean;
}

/**
 * Owner-facing review panel that lands on experiments in status `reviewing`
 * (active) or `followups_running` (read-only). Renders:
 *
 *  - Improve button: queues an experiment-improve agent_run with all unresolved
 *    anchored comments + all Quick-checked follow-ups bundled in.
 *  - Done reviewing button: PATCHes the experiment to `clean_result_drafting`.
 *  - Follow-ups list: kind='todo' comments (from auto-proposer + owner adds),
 *    each with Q (quick, inline) and T (todo, new child experiment) checkboxes.
 *  - Add form: posts a new kind='todo' comment.
 *  - Submit-selected button: fires the Improve run if any Q is checked, and
 *    creates one child experiment per T-checked row.
 *
 * While the experiment is in `followups_running`, the panel is rendered
 * read-only with a banner — the owner waits for in-flight follow-up children
 * to finish before re-entering review.
 */
export function ExperimentReviewPanel({
  experimentId,
  status,
}: {
  experimentId: string;
  status: ExperimentReviewStatus;
}) {
  const locked = status === 'followups_running';

  const [followups, setFollowups] = useState<FollowupComment[] | null>(null);
  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  const [improveStatus, setImproveStatus] = useState<ImproveStatus | null>(null);
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState<'improve' | 'todos' | 'done' | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFollowups = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/comments?entityKind=experiment&entityId=${encodeURIComponent(experimentId)}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        comments: Array<{ id: string; kind: string; body: string; resolvedAt: string | null; createdAt: string }>;
      };
      const todos = data.comments
        .filter((c) => c.kind === 'todo' && !c.resolvedAt)
        .map((c) => ({ id: c.id, body: c.body, resolvedAt: c.resolvedAt, createdAt: c.createdAt }));
      setFollowups(todos);
    } catch {
      // network — keep last view
    }
  }, [experimentId]);

  const loadImproveStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/experiments/${experimentId}/improve`);
      if (!res.ok) return;
      const data = (await res.json()) as ImproveStatus;
      setImproveStatus(data);
    } catch {
      // network — keep last view
    }
  }, [experimentId]);

  useEffect(() => {
    void loadFollowups();
    void loadImproveStatus();
  }, [loadFollowups, loadImproveStatus]);

  useDashboardLiveSignal(() => {
    void loadFollowups();
    void loadImproveStatus();
  });

  const selectedQuickIds = useMemo(
    () => Object.entries(selection).filter(([, s]) => s.quick).map(([id]) => id),
    [selection],
  );
  const selectedTodoIds = useMemo(
    () => Object.entries(selection).filter(([, s]) => s.todo).map(([id]) => id),
    [selection],
  );

  function toggle(id: string, field: 'quick' | 'todo') {
    setSelection((prev) => {
      const current = prev[id] ?? { quick: false, todo: false };
      const next: RowSelection = { ...current, [field]: !current[field] };
      // Mutually exclusive per row.
      if (field === 'quick' && next.quick) next.todo = false;
      if (field === 'todo' && next.todo) next.quick = false;
      return { ...prev, [id]: next };
    });
  }

  async function addFollowup() {
    if (!newBody.trim()) return;
    setSubmitting('add');
    setError(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityKind: 'experiment',
          entityId: experimentId,
          kind: 'todo',
          body: newBody.trim(),
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `${res.status} ${res.statusText}`);
      }
      setNewBody('');
      await loadFollowups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'add failed');
    } finally {
      setSubmitting(null);
    }
  }

  async function fireImprove() {
    setSubmitting('improve');
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/improve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quickFollowupCommentIds: selectedQuickIds }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `${res.status} ${res.statusText}`);
      }
      // Clear Q selection; T selection is independent.
      setSelection((prev) => {
        const next: Record<string, RowSelection> = {};
        for (const [id, s] of Object.entries(prev)) next[id] = { ...s, quick: false };
        return next;
      });
      await Promise.all([loadFollowups(), loadImproveStatus()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'improve failed');
    } finally {
      setSubmitting(null);
    }
  }

  async function queueTodos() {
    if (selectedTodoIds.length === 0) return;
    setSubmitting('todos');
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/queue-followups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ todoFollowupCommentIds: selectedTodoIds }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `${res.status} ${res.statusText}`);
      }
      setSelection({});
      await loadFollowups();
      // Status will flip to followups_running; reload page to pick up new gating.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'queue follow-ups failed');
    } finally {
      setSubmitting(null);
    }
  }

  async function markDone() {
    setSubmitting('done');
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: 'clean_result_drafting',
          note: 'Owner closed review.',
        }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `${res.status} ${res.statusText}`);
      }
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'mark done failed');
    } finally {
      setSubmitting(null);
    }
  }

  const commentCount = improveStatus?.unresolvedCommentCount ?? 0;
  const improvePending = improveStatus?.pendingRunId !== null && improveStatus?.pendingRunId !== undefined;
  const improveDisabled = locked || submitting !== null || improvePending || (commentCount === 0 && selectedQuickIds.length === 0);
  const queueTodosDisabled = locked || submitting !== null || selectedTodoIds.length === 0;
  const doneDisabled = locked || submitting !== null || improvePending || selectedTodoIds.length > 0 || selectedQuickIds.length > 0;

  return (
    <section className="space-y-4 rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Review
        </h2>
        {locked ? (
          <span className="rounded-md bg-[--color-warning-bg] px-2 py-1 text-xs text-[--color-warning-fg]">
            Follow-ups running — waiting for children to finish
          </span>
        ) : null}
      </header>

      {improvePending ? (
        <p className="rounded-md bg-[--color-info-bg] px-3 py-2 text-xs text-[--color-info-fg]">
          Improve run in flight ({improveStatus?.pendingRunId?.slice(0, 8)}). Comments + selected Quick follow-ups are
          being addressed.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void fireImprove()}
          disabled={improveDisabled}
          className={
            improveDisabled
              ? 'rounded-md border border-[--color-border] bg-[--color-muted-bg] px-3 py-1.5 text-sm text-[--color-muted]'
              : 'rounded-md bg-[--color-accent] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90'
          }
        >
          {submitting === 'improve' ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Queueing…</span>
          ) : (
            <>
              Improve
              {commentCount + selectedQuickIds.length > 0
                ? ` (${commentCount} comment${commentCount === 1 ? '' : 's'}${selectedQuickIds.length > 0 ? ` + ${selectedQuickIds.length} Q` : ''})`
                : ''}
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => void queueTodos()}
          disabled={queueTodosDisabled}
          className={
            queueTodosDisabled
              ? 'rounded-md border border-[--color-border] bg-[--color-muted-bg] px-3 py-1.5 text-sm text-[--color-muted]'
              : 'rounded-md border border-[--color-accent] bg-transparent px-3 py-1.5 text-sm font-medium text-[--color-accent] hover:bg-[--color-accent]/10'
          }
        >
          {submitting === 'todos' ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Queueing…</span>
          ) : (
            <>Run {selectedTodoIds.length} as new experiment{selectedTodoIds.length === 1 ? '' : 's'}</>
          )}
        </button>

        <button
          type="button"
          onClick={() => void markDone()}
          disabled={doneDisabled}
          className={
            doneDisabled
              ? 'ml-auto rounded-md border border-[--color-border] bg-[--color-muted-bg] px-3 py-1.5 text-sm text-[--color-muted]'
              : 'ml-auto rounded-md border border-[--color-border] bg-transparent px-3 py-1.5 text-sm font-medium text-[--color-fg] hover:bg-[--color-muted-bg]'
          }
        >
          {submitting === 'done' ? (
            <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Closing…</span>
          ) : (
            'Done reviewing'
          )}
        </button>
      </div>

      {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">
            Follow-ups
          </h3>
          <span className="text-[10px] text-[--color-muted]">
            Q = quick (inline) · T = todo (new experiment)
          </span>
        </div>

        {followups === null ? (
          <p className="text-xs text-[--color-muted]">Loading…</p>
        ) : followups.length === 0 ? (
          <p className="text-xs text-[--color-muted]">No proposed follow-ups yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {followups.map((c) => {
              const sel = selection[c.id] ?? { quick: false, todo: false };
              return (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2"
                >
                  <div className="flex flex-col gap-1 pt-0.5 text-[10px] uppercase tracking-wide text-[--color-muted]">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={sel.quick}
                        onChange={() => toggle(c.id, 'quick')}
                        disabled={locked || submitting !== null}
                      />
                      Q
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={sel.todo}
                        onChange={() => toggle(c.id, 'todo')}
                        disabled={locked || submitting !== null}
                      />
                      T
                    </label>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <Markdown>{c.body}</Markdown>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {!locked ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addFollowup();
            }}
            className="flex flex-col gap-2 pt-1"
          >
            <textarea
              value={newBody}
              onChange={(event) => setNewBody(event.target.value)}
              placeholder="Add a follow-up idea (title on first line, rationale below)…"
              rows={2}
              className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm"
              disabled={submitting !== null}
            />
            <button
              type="submit"
              disabled={submitting !== null || !newBody.trim()}
              className="self-end rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs text-[--color-fg] disabled:opacity-50"
            >
              {submitting === 'add' ? 'Adding…' : 'Add follow-up'}
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}
