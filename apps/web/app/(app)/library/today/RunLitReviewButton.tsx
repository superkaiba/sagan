'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RunLitReviewButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/lit-review/run', { method: 'POST' });
      if (!res.ok) {
        setMsg('failed');
        return;
      }
      const data = (await res.json()) as { inserted: number; surfaced: number };
      setMsg(`+${data.inserted} new, ${data.surfaced} surfaced`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="text-xs text-[--color-muted]">{msg}</span> : null}
      <button
        type="button"
        disabled={busy}
        onClick={run}
        className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
      >
        {busy ? 'Running…' : 'Run lit review'}
      </button>
    </div>
  );
}
