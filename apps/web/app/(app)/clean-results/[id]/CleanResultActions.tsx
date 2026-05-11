'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CleanResultActions({ id, status }: { id: string; status: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const router = useRouter();

  async function approve() {
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/clean-results/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(data.error ?? 'approve_failed');
      else router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    setBusy('share');
    setError(null);
    try {
      const res = await fetch(`/api/clean-results/${id}/share`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
      if (!res.ok || !data.url) setError(data.error ?? 'share_failed');
      else {
        setShareUrl(data.url);
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' || status === 'reviewing' ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={approve}
            className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
          >
            {busy === 'approve' ? 'Approving...' : 'Approve'}
          </button>
        ) : null}
        {status === 'approved' || status === 'shared' ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={share}
            className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium hover:border-[--color-fg] disabled:opacity-50"
          >
            {busy === 'share' ? 'Sharing...' : 'Create share link'}
          </button>
        ) : null}
      </div>
      {shareUrl ? <p className="font-mono text-xs text-[--color-muted]">{shareUrl}</p> : null}
      {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}
    </div>
  );
}
