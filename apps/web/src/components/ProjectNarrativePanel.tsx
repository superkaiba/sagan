'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CommentableBody } from './CommentableBody';

interface Narrative {
  id: string;
  title: string;
  bodyMd: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
}

interface Props {
  projectId: string;
  projectTitle: string;
  /** The project's currently-published narrative, if any. */
  published: Narrative | null;
  /** The most recent draft, if any. */
  latestDraft: Narrative | null;
}

export function ProjectNarrativePanel({ projectId, projectTitle, published, latestDraft }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  async function createNarrative() {
    setCreating(true);
    try {
      const res = await fetch('/api/project-narratives', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, title: `${projectTitle} — running summary` }),
      });
      if (res.ok) {
        const data = (await res.json()) as { narrative: Narrative };
        router.push(`/e/project_narrative/${data.narrative.id}`);
      }
    } finally {
      setCreating(false);
    }
  }

  async function publish(id: string) {
    await fetch(`/api/project-narratives/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    router.refresh();
  }

  if (!published && !latestDraft) {
    return (
      <section className="rounded-lg border border-dashed border-[--color-border] p-4 text-sm">
        <p className="text-[--color-muted]">No running summary yet.</p>
        <button
          type="button"
          disabled={creating}
          onClick={createNarrative}
          className="mt-2 rounded-md bg-[--color-accent] px-3 py-1 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create running summary'}
        </button>
      </section>
    );
  }

  const showing = published ?? latestDraft!;

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Running summary
          <span className="ml-2 text-[10px]">{showing.status}</span>
        </h2>
        <div className="flex gap-2 text-xs">
          {showing.status === 'draft' ? (
            <button
              type="button"
              onClick={() => publish(showing.id)}
              className="rounded-md bg-[--color-accent] px-2 py-0.5 text-[--color-accent-fg]"
            >
              Publish
            </button>
          ) : null}
          <Link
            href={`/e/project_narrative/${showing.id}`}
            className="text-[--color-muted] hover:text-[--color-fg]"
          >
            Edit →
          </Link>
        </div>
      </div>
      {showing.bodyMd.trim() ? (
        <CommentableBody body={showing.bodyMd} />
      ) : (
        <p className="text-sm text-[--color-muted]">Empty. Click Edit → to write.</p>
      )}
    </section>
  );
}
