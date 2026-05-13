'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BookmarkCheck, BookOpen, BookOpenCheck, Eye, FileText, GraduationCap, Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type LitReadState =
  | 'unread'
  | 'summary_read'
  | 'saved_for_later'
  | 'reading'
  | 'read'
  | 'read_deeply';

const STATES: Array<{
  key: LitReadState;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  helper: string;
}> = [
  { key: 'unread', label: 'Unread', short: 'unread', icon: FileText, helper: 'Haven\'t looked at it yet' },
  { key: 'summary_read', label: 'Summary read', short: 'summary', icon: Eye, helper: 'Read the AI summary only' },
  { key: 'saved_for_later', label: 'Saved for later', short: 'saved', icon: BookmarkCheck, helper: 'Worth reading thoroughly later' },
  { key: 'reading', label: 'Reading', short: 'reading', icon: BookOpen, helper: 'Currently working through it' },
  { key: 'read', label: 'Read', short: 'read', icon: BookOpenCheck, helper: 'Finished — got the gist' },
  { key: 'read_deeply', label: 'Read deeply', short: 'deeply', icon: GraduationCap, helper: 'Studied carefully, can build on it' },
];

export function LitReadStateControl({
  litItemId,
  initialState,
}: {
  litItemId: string;
  initialState: LitReadState;
}) {
  const router = useRouter();
  const [state, setState] = useState<LitReadState>(initialState);
  const [pending, setPending] = useState<LitReadState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function setReadState(next: LitReadState) {
    if (next === state || pending) return;
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/lit-items/${litItemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ readState: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Failed: ${data?.error ?? res.statusText}`);
        return;
      }
      setState(next);
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel] text-sm shadow-[var(--shadow-inset)]">
      <header className="border-b border-[--color-border] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[--color-muted]">
        Reading status
      </header>
      <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3">
        {STATES.map(({ key, label, icon: Icon, helper }) => {
          const active = key === state;
          const isPending = pending === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setReadState(key)}
              disabled={pending !== null}
              title={helper}
              className={cn(
                'inline-flex flex-col items-start gap-0.5 rounded-[--radius-control] border px-2 py-1.5 text-left text-xs transition-colors',
                active
                  ? 'border-[--color-accent]/60 bg-[--color-accent]/12 text-[--color-fg] shadow-[var(--shadow-inset)]'
                  : 'border-[--color-border] bg-[--color-bg] text-[--color-muted] hover:border-[--color-accent]/30 hover:text-[--color-fg]',
                pending !== null && !active && 'opacity-50',
              )}
              aria-pressed={active}
            >
              <span className="inline-flex items-center gap-1.5 font-semibold">
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden={true} />
                ) : (
                  <Icon className="h-3.5 w-3.5" aria-hidden={true} />
                )}
                {label}
              </span>
              <span className="text-[10px] leading-tight text-[--color-muted]/85">{helper}</span>
            </button>
          );
        })}
      </div>
      {error ? <p className="border-t border-[--color-border] px-4 py-2 text-xs text-[--color-danger]">{error}</p> : null}
    </section>
  );
}
