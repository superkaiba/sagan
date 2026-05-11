'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function ExperimentProposalForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/experiments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          hypothesis: hypothesis.trim() || undefined,
          status: 'proposed',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        experiment?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.experiment) {
        setError(data.error ?? 'create_failed');
        return;
      }
      setTitle('');
      setHypothesis('');
      router.push(`/e/experiment/${data.experiment.id}`);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Experiment</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short title"
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Hypothesis or goal</span>
          <textarea
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            rows={3}
            placeholder="What should this test or clarify?"
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
        </label>
      </div>
      {error ? <p className="text-sm text-[--color-danger]">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-md bg-[--color-accent] px-4 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create proposal'}
        </button>
      </div>
    </form>
  );
}
