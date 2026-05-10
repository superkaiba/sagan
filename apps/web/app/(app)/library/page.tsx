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

export default async function LibraryPage() {
  const rows = await db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(500);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <div className="flex items-baseline gap-3 text-sm">
          <Link href="/library/today" className="text-[--color-accent] hover:underline">
            Today's lit review →
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
                        <p className="truncate">{r.title}</p>
                        <p className="text-[10px] uppercase tracking-wide text-[--color-muted]">
                          {r.type}
                          {r.arxivId ? ` · ${r.arxivId}` : null}
                        </p>
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
