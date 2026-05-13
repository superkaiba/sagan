'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ApprovalAction } from '@/lib/dashboard';
import { cn } from '@/lib/cn';

export function ApprovalDispatchButton({
  action,
  className,
}: {
  action: ApprovalAction;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = 'Approve';

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      let res: Response;
      if (action.kind === 'agent_run') {
        res = await fetch(`/api/agent-runs/${action.id}/approve`, { method: 'POST' });
      } else if (action.kind === 'experiment') {
        res = await fetch('/api/pipeline/advance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: action.id,
            kind: 'experiment',
            fromStage: 'approval',
            toStage: 'running',
          }),
        });
      } else {
        res = await fetch('/api/pipeline/advance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            id: action.id,
            kind: 'clean_result',
            fromStage: 'review',
            toStage: 'done',
          }),
        });
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? 'Approval failed.');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn('space-y-1', className)}>
      <button
        type="button"
        onClick={approve}
        disabled={busy}
        className="sagan-card-approve-button inline-flex w-full items-center justify-center gap-1.5 border border-[--color-attention] bg-[--color-attention] px-2 py-1 text-[11px] font-semibold text-[--color-attention-fg] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[--color-focus] disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
        {label}
      </button>
      {error ? <p className="text-[10px] leading-3 text-[--color-danger]">{error}</p> : null}
    </div>
  );
}
