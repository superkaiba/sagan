'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'plan' | 'apply' | 'qa' | 'experiment';

const KIND_HINTS: Record<Kind, string> = {
  plan: 'Plan-only. Claude writes a plan; nothing is edited until you approve.',
  apply: 'Edits files directly under the auto-accept policy. Use for safe, well-scoped changes.',
  qa: 'Read-only Q&A. Tools restricted to Read/Grep/Glob.',
  experiment: 'Plan a RunPod experiment. Approval triggers pod dispatch.',
};

export function DispatchForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('plan');
  const [request, setRequest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!request.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/agent-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, request, approvalRequired: kind !== 'apply' }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'dispatch_failed');
        return;
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/agent/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network_error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4"
    >
      <div className="flex flex-wrap gap-2">
        {(['plan', 'apply', 'qa', 'experiment'] as Kind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={
              'rounded-md px-3 py-1.5 text-xs font-medium border ' +
              (kind === k
                ? 'border-[--color-accent] bg-[--color-accent] text-[--color-accent-fg]'
                : 'border-[--color-border] hover:border-[--color-fg]')
            }
          >
            {k}
          </button>
        ))}
      </div>
      <p className="text-xs text-[--color-muted]">{KIND_HINTS[kind]}</p>

      <textarea
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        rows={4}
        placeholder="What should the agent do?"
        className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
      />

      {error ? <p className="text-sm text-[--color-danger]">{error}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !request.trim()}
          className="rounded-md bg-[--color-accent] px-4 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {submitting ? 'Dispatching…' : 'Dispatch'}
        </button>
      </div>
    </form>
  );
}
