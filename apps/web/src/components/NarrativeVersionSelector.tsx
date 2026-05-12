'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';

interface Version {
  id: string;
  title: string;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  isCurrent: boolean;
}

/**
 * Dropdown for selecting which narrative version to view. The currently
 * published one is the default (no `?v=` query param); selecting any other
 * version sets `?v=<id>` on the URL.
 */
export function NarrativeVersionSelector({
  versions,
  selectedId,
  basePath,
}: {
  versions: Version[];
  selectedId: string;
  basePath: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const newId = event.target.value;
    const current = versions.find((v) => v.isCurrent);
    const params = new URLSearchParams(searchParams.toString());
    if (current && newId === current.id) {
      params.delete('v');
    } else {
      params.set('v', newId);
    }
    const qs = params.toString();
    router.push(`${basePath}${qs ? `?${qs}` : ''}`);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-[--color-muted]">
      <span>Version:</span>
      <select
        value={selectedId}
        onChange={onChange}
        className="rounded-md border border-[--color-border] bg-[--color-panel] px-2 py-1 text-xs"
      >
        {versions.map((v) => {
          const dateLabel = v.publishedAt
            ? new Date(v.publishedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })
            : 'unpublished';
          return (
            <option key={v.id} value={v.id}>
              {dateLabel}
              {v.isCurrent ? ' — current' : ''}
            </option>
          );
        })}
      </select>
    </label>
  );
}
