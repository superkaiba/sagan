'use client';

import { useEffect, useState } from 'react';

interface Status {
  unresolvedCommentCount: number;
  pendingRunId: string | null;
}

/**
 * Improve button for a project narrative. Reads the count of unresolved comments;
 * when clicked, batches them into a single agent_run that asks Claude to address
 * all of them and produce a new narrative draft.
 *
 * Idempotent: while a previous improve run is queued/running for this narrative,
 * the button is disabled.
 */
export function ImproveNarrativeButton({ narrativeId }: { narrativeId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/narratives/${narrativeId}/improve`);
    if (!res.ok) return;
    const data = (await res.json()) as Status;
    setStatus(data);
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [narrativeId]);

  async function onClick() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/narratives/${narrativeId}/improve`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `${res.status} ${res.statusText}`);
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const count = status?.unresolvedCommentCount ?? 0;
  const pending = status?.pendingRunId !== null && status?.pendingRunId !== undefined;
  const disabled = submitting || pending || count === 0;

  return (
    <div className="flex items-center gap-3">
      {error ? <span className="text-xs text-[--color-danger]">{error}</span> : null}
      {pending ? (
        <span className="text-xs text-[--color-muted]">Claude is addressing comments…</span>
      ) : null}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={
          disabled
            ? 'rounded-md border border-[--color-border] bg-[--color-muted-bg] px-3 py-1.5 text-sm text-[--color-muted]'
            : 'rounded-md bg-[--color-accent] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90'
        }
      >
        {submitting
          ? 'Queueing…'
          : pending
            ? 'Improving…'
            : count > 0
              ? `Improve (${count} comment${count === 1 ? '' : 's'})`
              : 'Improve'}
      </button>
    </div>
  );
}
