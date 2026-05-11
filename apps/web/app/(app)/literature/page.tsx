import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { BookOpen, FileSearch, Library } from 'lucide-react';
import { litItems } from '@sagan/db/schema';
import { EmptyState, ListRow, MetricTile, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { NewLitItemForm } from '../library/NewLitItemForm';

export const dynamic = 'force-dynamic';

const STATES: Array<{ key: 'reading' | 'queued' | 'unread' | 'read'; title: string }> = [
  { key: 'reading', title: 'Reading' },
  { key: 'queued', title: 'Queue' },
  { key: 'unread', title: 'Triage' },
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

function releasedText(value: string | Date | null) {
  if (!value) return 'No date';
  return typeof value === 'string' ? value : value.toISOString().slice(0, 10);
}

export default async function LiteraturePage() {
  const rows = await db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(500);
  const activeCount = rows.filter((item) => ['reading', 'queued', 'unread'].includes(item.readState)).length;
  const rankedCount = rows.filter((item) => item.lastRankedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Literature"
        description="Reading queue, triage, summaries, citations, and research connections."
        meta={`${rows.length} items`}
        actions={
          <Link href="/library/today" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Daily queue
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Needs attention" value={activeCount} tone={activeCount > 0 ? 'info' : 'neutral'} />
        <MetricTile label="Ranked" value={rankedCount} />
        <MetricTile label="Read" value={rows.filter((item) => item.readState === 'read').length} tone="success" />
      </section>

      <NewLitItemForm />

      {rows.length === 0 ? (
        <EmptyState
          icon={<Library className="h-5 w-5" aria-hidden="true" />}
          title="No literature yet"
          message="Add a paper, report, repository, or note to start a reading queue."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {STATES.map((state) => {
            const items = rows.filter((item) => item.readState === state.key);
            return (
              <Panel key={state.key} className="overflow-hidden">
                <div className="flex min-h-12 items-center justify-between border-b border-[--color-border] px-4 py-3">
                  <h2 className="text-sm font-semibold tracking-tight">{state.title}</h2>
                  <span className="font-mono text-xs text-[--color-muted]">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[--color-muted]">No items.</p>
                ) : (
                  <div className="divide-y divide-[--color-border]">
                    {items.slice(0, 25).map((item) => (
                      <ListRow
                        key={item.id}
                        href={`/e/lit_item/${item.id}`}
                        leading={<FileSearch className="h-4 w-4" aria-hidden="true" />}
                        title={item.title}
                        detail={item.summaryMd || item.relevanceReasonMd || item.abstract || authorsText(item.authors)}
                        meta={
                          <span className="inline-flex flex-wrap items-center gap-2">
                            <StatusBadge status={item.readState} />
                            <span>{item.type}</span>
                            <span>{releasedText(item.releasedOn)}</span>
                            {item.arxivId ? <span>{item.arxivId}</span> : null}
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
