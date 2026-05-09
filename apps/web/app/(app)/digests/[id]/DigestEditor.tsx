'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/Markdown';

export function DigestEditor({
  id,
  initialBody,
  sent,
}: {
  id: string;
  initialBody: string;
  sent: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialBody);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/weekly-digests/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bodyMd: draft }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function markSent() {
    await fetch(`/api/weekly-digests/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sentAt: true }),
    });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-[--color-border] px-3 py-1 text-xs hover:border-[--color-fg]"
          >
            Edit
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                setDraft(initialBody);
                setEditing(false);
              }}
              className="rounded-md border border-[--color-border] px-3 py-1 text-xs hover:border-[--color-fg]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
        {!sent ? (
          <button
            type="button"
            onClick={markSent}
            className="rounded-md border border-[--color-border] px-3 py-1 text-xs text-[--color-muted] hover:text-[--color-fg]"
          >
            Mark sent
          </button>
        ) : null}
      </div>

      {editing ? (
        <textarea
          rows={Math.max(20, draft.split('\n').length + 2)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
      ) : (
        <article className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
          {draft.trim() ? <Markdown>{draft}</Markdown> : <p className="text-sm text-[--color-muted]">Empty.</p>}
        </article>
      )}
    </div>
  );
}
