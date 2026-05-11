'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  day: string;
  cleanResultCount: number;
}

export function CleanResultAssistant({ day, cleanResultCount }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<'question' | 'draft' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function askQuestion() {
    setBusy('question');
    setError(null);
    try {
      const res = await fetch('/api/daily-log/clean-result/question', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      const data = (await res.json().catch(() => ({}))) as { question?: string; error?: string };
      if (!res.ok || !data.question) {
        setError(data.error ?? 'question_failed');
        return;
      }
      setQuestion(data.question);
    } finally {
      setBusy(null);
    }
  }

  async function draftCleanResult() {
    setBusy('draft');
    setError(null);
    try {
      const res = await fetch('/api/daily-log/clean-result/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day, question, answer }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'draft_failed');
        return;
      }
      setAnswer('');
      setQuestion(null);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Clean result</h2>
        <div className="flex gap-3 text-xs">
          <Link href={`/mentor/daily/${day}`} className="text-[--color-accent] hover:underline">
            Mentor log
          </Link>
          <Link href={`/digest/${day}`} className="text-[--color-muted] hover:text-[--color-fg]">
            Full log
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-[--color-muted]">
        {cleanResultCount} clean result{cleanResultCount === 1 ? '' : 's'} today
      </p>

      {question ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-md border border-[--color-border] bg-[--color-bg] p-3 text-sm">
            {question}
          </p>
          <textarea
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer before drafting…"
            className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
          />
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[--color-danger]">{error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={askQuestion}
          disabled={busy !== null}
          className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium hover:border-[--color-fg] disabled:opacity-50"
        >
          {busy === 'question' ? 'Asking…' : question ? 'Ask again' : 'Ask quick question'}
        </button>
        <button
          type="button"
          onClick={draftCleanResult}
          disabled={busy !== null || !question}
          className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {busy === 'draft' ? 'Saving…' : 'Save clean result'}
        </button>
      </div>
    </section>
  );
}
