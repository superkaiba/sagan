'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  narrativeId: string;
  status: 'draft' | 'published' | 'archived';
  projectSlug: string | null;
  projectIsPublic: boolean;
}

export function NarrativePublishControl({
  narrativeId,
  status,
  projectSlug,
  projectIsPublic,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function setStatus(next: 'draft' | 'published') {
    setBusy(true);
    try {
      const res = await fetch(`/api/project-narratives/${narrativeId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'archived') return null;

  if (status === 'draft') {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus('published')}
        className="rounded-md bg-[--color-accent] px-2.5 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
      >
        {busy ? 'Publishing…' : 'Publish'}
      </button>
    );
  }

  const publicHref = projectSlug && projectIsPublic ? `/p/${projectSlug}` : null;

  return (
    <span className="inline-flex items-center gap-2 text-xs">
      {publicHref ? (
        <Link
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-[--color-border] px-2.5 py-1 hover:border-[--color-fg]"
        >
          View public page →
        </Link>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => setStatus('draft')}
        className="text-[--color-muted] hover:text-[--color-fg]"
      >
        {busy ? 'Saving…' : 'Move to draft'}
      </button>
    </span>
  );
}
