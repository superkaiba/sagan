'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const TYPES = ['paper', 'blog_post', 'forum_post', 'newsletter', 'report', 'repo', 'video', 'other'] as const;

export function NewLitItemForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [releasedOn, setReleasedOn] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('paper');
  const [summary, setSummary] = useState('');
  const [abstract, setAbstract] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/lit-items', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          type,
          authors: authors
            .split(',')
            .map((author) => author.trim())
            .filter(Boolean),
          releasedOn: releasedOn || undefined,
          url: url || undefined,
          summaryMd: summary || undefined,
          abstract: abstract || undefined,
        }),
      });
      if (res.ok) {
        setTitle('');
        setAuthors('');
        setReleasedOn('');
        setUrl('');
        setSummary('');
        setAbstract('');
        router.refresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3"
    >
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <input
          type="text"
          value={authors}
          onChange={(e) => setAuthors(e.target.value)}
          placeholder="Authors, comma separated"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
      </div>
      <div className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)_9rem_auto]">
        <input
          type="date"
          value={releasedOn}
          onChange={(e) => setReleasedOn(e.target.value)}
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1.5 text-xs"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {submitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <textarea
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Brief summary"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <textarea
          rows={2}
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          placeholder="Abstract"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
      </div>
    </form>
  );
}
