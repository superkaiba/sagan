'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  kind: 'project' | 'belief' | 'todo' | 'lit_item' | 'project_narrative' | 'experiment';
  id: string;
  initialTitle: string;
}

const TITLE_FIELD: Record<Props['kind'], string> = {
  project: 'title',
  belief: 'title',
  todo: 'text',
  lit_item: 'title',
  project_narrative: 'title',
  experiment: 'title',
};
const ENDPOINT_PLURAL: Record<Props['kind'], string> = {
  project: 'projects',
  belief: 'beliefs',
  todo: 'todos',
  lit_item: 'lit-items',
  project_narrative: 'project-narratives',
  experiment: 'experiments',
};

export function EditableTitle({ kind, id, initialTitle }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!draft.trim() || draft.trim() === initialTitle) {
      setEditing(false);
      setDraft(initialTitle);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/${ENDPOINT_PLURAL[kind]}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [TITLE_FIELD[kind]]: draft.trim() }),
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
    return (
      <h1
        onClick={() => setEditing(true)}
        className="text-2xl font-semibold tracking-tight cursor-text hover:bg-[--color-muted-bg] rounded px-1 -mx-1"
        title="Click to edit"
      >
        {initialTitle}
      </h1>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void save();
        } else if (e.key === 'Escape') {
          setDraft(initialTitle);
          setEditing(false);
        }
      }}
      className="w-full rounded-md border border-[--color-accent] bg-[--color-bg] px-1 -mx-1 text-2xl font-semibold tracking-tight focus:outline-none"
    />
  );
}
