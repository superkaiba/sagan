'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CommentableBody } from './CommentableBody';

interface Props {
  kind: 'project' | 'belief' | 'todo' | 'lit_item' | 'project_narrative' | 'experiment' | 'run' | 'daily_log_entry' | 'clean_result';
  id: string;
  initialBody: string;
  /** PATCH endpoint to hit. Defaults to /api/<plural> */
  endpoint?: string;
  /** Field name to send on PATCH */
  field?: string;
}

const DEFAULT_FIELD: Record<Props['kind'], string> = {
  project: 'summaryMd',
  belief: 'currentBelief',
  todo: 'bodyMd',
  lit_item: 'abstract',
  project_narrative: 'bodyMd',
  experiment: 'body',
  run: 'notesMd',
  daily_log_entry: 'bodyMd',
  clean_result: 'bodyMd',
};

const DEFAULT_ENDPOINT_PLURAL: Record<Props['kind'], string> = {
  project: 'projects',
  belief: 'beliefs',
  todo: 'todos',
  lit_item: 'lit-items',
  project_narrative: 'project-narratives',
  experiment: 'experiments',
  run: 'runs',
  daily_log_entry: 'daily-log',
  clean_result: 'clean-results',
};

export function EditableBody({ kind, id, initialBody, endpoint, field }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const fieldName = field ?? DEFAULT_FIELD[kind];
  const url = endpoint ?? `/api/${DEFAULT_ENDPOINT_PLURAL[kind]}/${id}`;

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [fieldName]: draft }),
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const isEmpty = !initialBody?.trim();
    return (
      <section className="group relative rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={
            isEmpty
              ? 'absolute right-4 top-4 z-10 text-xs text-[--color-accent] hover:underline'
              : 'absolute right-4 top-4 z-10 text-xs text-[--color-muted] opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]'
          }
        >
          {isEmpty ? 'Add description' : 'Edit'}
        </button>
        <CommentableBody body={initialBody} />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-2">
      <textarea
        rows={Math.max(8, draft.split('\n').length + 1)}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        placeholder="HTML or markdown. Sanitized server-side before render."
      />
      <div className="flex justify-end gap-2">
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
      </div>
    </section>
  );
}
