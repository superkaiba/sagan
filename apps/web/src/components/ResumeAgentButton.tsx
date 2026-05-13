'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ResumeAgentButtonProps {
  runId: string;
  className?: string;
}

export function ResumeAgentButton({ runId, className }: ResumeAgentButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function resume() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/retry`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { runId?: string; error?: string; message?: string };
      if (!res.ok || !data.runId) {
        setError(data.message ?? data.error ?? 'Resume failed');
        return;
      }
      router.push(`/agent/${data.runId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={resume}
        className={
          className ??
          'rounded-md border border-[--color-border] px-2 py-1 text-xs font-medium hover:border-[--color-fg] disabled:opacity-50'
        }
      >
        {busy ? 'Resuming...' : 'Resume'}
      </button>
      {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}
    </div>
  );
}
