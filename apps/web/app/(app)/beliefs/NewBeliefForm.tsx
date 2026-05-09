'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface ProjectOpt {
  id: string;
  title: string;
}

export function NewBeliefForm({ projects }: { projects: ProjectOpt[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('');
  const [confidence, setConfidence] = useState<'LOW' | 'MODERATE' | 'HIGH'>('MODERATE');
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/beliefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title,
          projectId: projectId || undefined,
          topic: topic || undefined,
          confidence,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { belief: { id: string } };
        setTitle('');
        setTopic('');
        router.push(`/e/belief/${data.belief.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Belief title (a hypothesis stated as a sentence)…"
        className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
      />
      <div className="flex flex-wrap gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
        >
          <option value="">No project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        <select
          value={confidence}
          onChange={(e) => setConfidence(e.target.value as 'LOW' | 'MODERATE' | 'HIGH')}
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
        >
          <option value="LOW">low confidence</option>
          <option value="MODERATE">moderate</option>
          <option value="HIGH">high</option>
        </select>
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Topic (optional)"
          className="rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-xs"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="ml-auto rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          Create
        </button>
      </div>
    </form>
  );
}
