'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function GenerateDigestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/weekly-digest/run', { method: 'POST' });
      if (res.ok) {
        setMsg('queued · refreshing in 30s');
        setTimeout(() => router.refresh(), 30_000);
      } else {
        setMsg('failed');
      }
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
        {busy ? 'Queuing…' : 'Generate this week'}
      </button>
    </div>
  );
}
