'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function NewProjectForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        const data = (await res.json()) as { project: { id: string } };
        setTitle('');
        router.push(`/e/project/${data.project.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex gap-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="New project title…"
        className="flex-1 rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
      />
      <button
        type="submit"
        disabled={submitting || !title.trim()}
        className="rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
      >
        Create
      </button>
    </form>
  );
}
