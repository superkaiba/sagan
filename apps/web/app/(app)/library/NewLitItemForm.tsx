'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const TYPES = ['paper', 'blog_post', 'forum_post', 'newsletter', 'report', 'repo', 'video', 'other'] as const;

export function NewLitItemForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('paper');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/lit-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, type, url: url || undefined }),
      });
      if (res.ok) {
        setTitle('');
        setUrl('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap gap-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title…"
        className="min-w-[16rem] flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="URL (optional)"
        className="min-w-[12rem] flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
      />
      <select
        value={type}
        onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
        className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
