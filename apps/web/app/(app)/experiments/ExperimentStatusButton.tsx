'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type ExperimentStatus = 'planning' | 'plan_pending' | 'approved' | 'blocked';

export function ExperimentStatusButton({
  experimentId,
  status,
  label,
  note,
  variant = 'secondary',
}: {
  experimentId: string;
  status: ExperimentStatus;
  label: string;
  note?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'update_failed');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const className =
    variant === 'primary'
      ? 'bg-[--color-accent] text-[--color-accent-fg] border-[--color-accent]'
      : variant === 'danger'
        ? 'border-[--color-danger] text-[--color-danger] hover:bg-[--color-danger-bg]'
        : 'border-[--color-border] hover:border-[--color-fg]';

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={update}
        className={`rounded-md border px-2 py-1 text-xs font-medium disabled:opacity-50 ${className}`}
      >
        {busy ? 'Working...' : label}
      </button>
      {error ? <span className="text-xs text-[--color-danger]">{error}</span> : null}
    </span>
  );
}
