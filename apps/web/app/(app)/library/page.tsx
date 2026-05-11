import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { litItems } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { NewLitItemForm } from './NewLitItemForm';

export const dynamic = 'force-dynamic';

const STATES: Array<{ key: 'queued' | 'reading' | 'unread' | 'read' | 'archived'; title: string }> = [
  { key: 'reading', title: 'Reading' },
  { key: 'queued', title: 'Queue' },
  { key: 'unread', title: 'Unread' },
  { key: 'read', title: 'Read' },
];

function authorsText(value: unknown) {
  if (!value) return 'Unknown authors';
  if (Array.isArray(value)) {
    const authors = value
      .map((author) => {
        if (typeof author === 'string') return author;
        if (author && typeof author === 'object' && 'name' in author) {
          return String((author as { name?: unknown }).name ?? '');
        }
        return '';
      })
      .filter(Boolean);
    return authors.length > 0 ? authors.join(', ') : 'Unknown authors';
  }
  if (typeof value === 'string') return value;
  return 'Unknown authors';
}

function releaseDateText(value: string | Date | null) {
  if (!value) return 'No release date';
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

export default async function LibraryPage() {
  const rows = await db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(500);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <div className="flex items-baseline gap-3 text-sm">
          <Link href="/library/today" className="text-[--color-accent] hover:underline">
            Daily reading queue →
          </Link>
          <span className="text-[--color-muted]">{rows.length}</span>
        </div>
      </header>

      <NewLitItemForm />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {STATES.map((state) => {
          const items = rows.filter((r) => r.readState === state.key);
          return (
            <section key={state.key} className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3 space-y-2">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide">{state.title}</h2>
                <span className="text-xs text-[--color-muted]">{items.length}</span>
              </header>
              <ul className="space-y-1">
                {items.length === 0 ? (
                  <li className="text-xs text-[--color-muted]">empty</li>
                ) : (
                  items.slice(0, 20).map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/e/lit_item/${r.id}`}
                        className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]"
                      >
                        <p className="font-medium leading-snug">{r.title}</p>
                        <p className="mt-0.5 truncate text-xs text-[--color-muted]">{authorsText(r.authors)}</p>
                        <p className="text-[10px] uppercase tracking-wide text-[--color-muted]">
                          {releaseDateText(r.releasedOn)} · {r.type}
                          {r.arxivId ? ` · ${r.arxivId}` : null}
                          {r.lastRankedAt ? ` · Claude-ranked` : null}
                        </p>
                        {r.summaryMd ? (
                          <p className="mt-1 line-clamp-2 text-xs">{r.summaryMd}</p>
                        ) : null}
                        {r.relevanceReasonMd ? (
                          <p className="mt-1 line-clamp-2 text-xs text-[--color-muted]">{r.relevanceReasonMd}</p>
                        ) : null}
                        {r.abstract ? (
                          <p className="mt-1 line-clamp-3 text-xs text-[--color-muted]">{r.abstract}</p>
                        ) : null}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
