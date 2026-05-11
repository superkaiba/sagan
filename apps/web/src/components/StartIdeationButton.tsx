'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { IdeationSourceKind } from '@/lib/ideation';

export function StartIdeationButton({
  sourceKind,
  sourceId,
}: {
  sourceKind: IdeationSourceKind;
  sourceId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/ideation/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceKind, sourceId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        session?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.session) {
        setError(data.error ?? 'start_failed');
        return;
      }
      router.push(`/ideation/${data.session.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-xs font-medium hover:bg-[--color-muted-bg] disabled:opacity-50"
      >
        {busy ? 'Starting...' : 'Start ideation'}
      </button>
      {error ? <span className="text-xs text-[--color-danger]">{error}</span> : null}
    </div>
  );
}
