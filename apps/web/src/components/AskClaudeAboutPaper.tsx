'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageCircle, Sparkles } from 'lucide-react';

const SUGGESTIONS = [
  'Summarize the contribution in 3 bullets.',
  'How does this relate to my current research?',
  'What experiments would test the central claim?',
  'What are the weakest assumptions in the paper?',
];

export function AskClaudeAboutPaper({ litItemId, paperTitle }: { litItemId: string; paperTitle: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e?: FormEvent) {
    if (e) e.preventDefault();
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityKind: 'lit_item',
          entityId: litItemId,
          body: `@claude ${text}`,
          askAgent: 'Claude',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus(`Failed: ${data?.error ?? res.statusText}`);
        return;
      }
      setBody('');
      setStatus('Claude is on it — reply will appear in the conversation below.');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function usePrompt(text: string) {
    setBody(text);
  }

  return (
    <section
      aria-labelledby="ask-claude-heading"
      className="sagan-suggested-paper rounded-[--radius-control] p-4 text-sm shadow-[var(--shadow-inset)]"
    >
      <header className="relative flex items-center gap-2 text-[--color-accent]">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        <h3 id="ask-claude-heading" className="text-xs font-semibold uppercase tracking-[0.18em]">
          Ask Claude about this paper
        </h3>
      </header>
      <p className="relative mt-2 text-xs text-[--color-muted]">
        Posts a comment with <span className="font-mono">@claude</span> so the runner spins up a Claude Code session
        scoped to <span className="italic">{paperTitle || 'this paper'}</span>. Replies appear in the conversation
        below.
      </p>
      <form className="relative mt-3 space-y-2" onSubmit={submit}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What do you want to ask?"
          className="w-full rounded-[--radius-control] border border-[--color-border] bg-[--color-panel] px-3 py-2 text-sm shadow-[var(--shadow-inset)] focus:outline-none focus:ring-1 focus:ring-[--color-accent]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-[--color-muted]">{body.length}/4000</span>
          <button
            type="submit"
            disabled={submitting || body.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-[--radius-control] bg-[--color-accent] px-3 py-1.5 text-xs font-semibold text-[--color-accent-fg] disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Ask Claude
          </button>
        </div>
      </form>
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => usePrompt(s)}
            className="rounded-full border border-[--color-border] bg-[--color-panel] px-2 py-1 text-[11px] text-[--color-muted] hover:border-[--color-accent] hover:text-[--color-fg]"
          >
            {s}
          </button>
        ))}
      </div>
      {status ? <p className="relative mt-2 text-xs text-[--color-muted]">{status}</p> : null}
    </section>
  );
}
