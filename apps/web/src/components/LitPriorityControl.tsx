'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsDown, Equal, Flame, Loader2, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/cn';

export type LitPriority = 'low' | 'normal' | 'high' | 'urgent';

const PRIORITIES: Array<{
  key: LitPriority;
  label: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Tailwind/CSS-var classes used when this option is active. */
  activeClass: string;
  helper: string;
}> = [
  { key: 'low', label: 'Low', icon: ChevronsDown, helper: 'No rush', activeClass: 'border-[--color-muted] bg-[--color-muted-bg] text-[--color-muted]' },
  { key: 'normal', label: 'Normal', icon: Equal, helper: 'Default queue order', activeClass: 'border-[--color-border] bg-[--color-bg] text-[--color-fg]' },
  { key: 'high', label: 'High', icon: TrendingUp, helper: 'Surface above normal items', activeClass: 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]' },
  { key: 'urgent', label: 'Urgent', icon: Flame, helper: 'Read next', activeClass: 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]' },
];

export function LitPriorityControl({
  litItemId,
  initialPriority,
}: {
  litItemId: string;
  initialPriority: LitPriority;
}) {
  const router = useRouter();
  const [priority, setPriority] = useState<LitPriority>(initialPriority);
  const [pending, setPending] = useState<LitPriority | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function setLitPriority(next: LitPriority) {
    if (next === priority || pending) return;
    setPending(next);
    setError(null);
    try {
      const res = await fetch(`/api/lit-items/${litItemId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ priority: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Failed: ${data?.error ?? res.statusText}`);
        return;
      }
      setPriority(next);
      startTransition(() => router.refresh());
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel] text-sm shadow-[var(--shadow-inset)]">
      <header className="border-b border-[--color-border] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[--color-muted]">
        Priority
      </header>
      <div className="grid grid-cols-4 gap-1.5 p-2">
        {PRIORITIES.map(({ key, label, icon: Icon, helper, activeClass }) => {
          const active = key === priority;
          const isPending = pending === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setLitPriority(key)}
              disabled={pending !== null}
              title={helper}
              className={cn(
                'inline-flex flex-col items-start gap-0.5 rounded-[--radius-control] border px-2 py-1.5 text-left text-xs transition-colors',
                active
                  ? cn('shadow-[var(--shadow-inset)]', activeClass)
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

const PRIORITY_BADGE: Record<LitPriority, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  low: { label: 'low', className: 'border-[--color-border] bg-[--color-muted-bg] text-[--color-muted]', icon: ChevronsDown },
  normal: { label: 'normal', className: 'border-[--color-border] bg-[--color-bg] text-[--color-muted]', icon: Equal },
  high: { label: 'high', className: 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]', icon: TrendingUp },
  urgent: { label: 'urgent', className: 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]', icon: Flame },
};

/** Inline pill used in lists. Returns null for 'normal' to keep the row quiet. */
export function PriorityPill({ priority }: { priority: LitPriority }) {
  if (priority === 'normal') return null;
  const meta = PRIORITY_BADGE[priority];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]',
        meta.className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden={true} />
      {meta.label}
    </span>
  );
}
