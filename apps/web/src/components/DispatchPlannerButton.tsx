'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/cn';

export function DispatchPlannerButton({
  experimentId,
  label = 'Submit answers',
  size = 'md',
  className,
  onDispatched,
}: {
  experimentId: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
  onDispatched?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dispatch() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/dispatch-planner`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? 'Dispatch failed.');
      }
      if (onDispatched) onDispatched();
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dispatch failed.');
    } finally {
      setBusy(false);
    }
  }

  const small = size === 'sm';
  return (
    <div className={cn('space-y-1', className)}>
      <button
        type="button"
        onClick={dispatch}
        disabled={busy}
        className={cn(
          'inline-flex w-full items-center justify-center gap-1.5 rounded-md border font-medium focus:outline-none focus:ring-2 focus:ring-[--color-focus] disabled:cursor-wait disabled:opacity-60',
          small ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm',
          'border-[--color-attention] bg-[--color-attention] text-[--color-attention-fg] hover:brightness-105',
        )}
      >
        {busy ? (
          <Loader2 className={cn('animate-spin', small ? 'h-3 w-3' : 'h-4 w-4')} aria-hidden="true" />
        ) : (
          <Send className={small ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
        )}
        {label}
      </button>
      {error ? (
        <p className={cn(small ? 'text-[10px] leading-3' : 'text-xs', 'text-[--color-danger]')}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
