import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { BookOpen, ExternalLink, Library, Sparkles } from 'lucide-react';
import { litItems } from '@sagan/db/schema';
import { EmptyState, MetricTile, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { cn } from '@/lib/cn';
import { NewLitItemForm } from '../library/NewLitItemForm';

export const dynamic = 'force-dynamic';

type Topic = 'current_project' | 'general_safety' | 'general_ai' | 'cognitive_science' | 'neuroscience' | 'other';

const TOPIC_ORDER: Array<{ key: Topic; title: string; description: string }> = [
  { key: 'current_project', title: 'Related to current project', description: 'Directly connected to active beliefs, experiments, or clean results.' },
  { key: 'general_safety', title: 'General AI safety', description: 'Alignment, interpretability, evaluation of model risks.' },
  { key: 'general_ai', title: 'General AI', description: 'ML, NLP, and AI research not specific to safety.' },
  { key: 'cognitive_science', title: 'Cognitive science', description: 'Psychology, decision making, mind, behavior.' },
  { key: 'neuroscience', title: 'Neuroscience', description: 'Brain, neural systems, neuroimaging.' },
  { key: 'other', title: 'Other', description: 'Everything that did not fit a bucket above.' },
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
    if (authors.length === 0) return 'Unknown authors';
    if (authors.length <= 3) return authors.join(', ');
    return `${authors.slice(0, 3).join(', ')} +${authors.length - 3}`;
  }
  if (typeof value === 'string') return value;
  return 'Unknown authors';
}

function recencyLabel(value: string | Date | null) {
  if (!value) return 'No date';
  const dateStr = typeof value === 'string' ? value : value.toISOString().slice(0, 10);
  const released = new Date(`${dateStr}T00:00:00Z`).getTime();
  if (Number.isNaN(released)) return dateStr;
  const days = Math.floor((Date.now() - released) / (24 * 60 * 60 * 1000));
  if (days < 0) return dateStr;
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

export default async function LiteraturePage() {
  const rows = await db()
    .select()
    .from(litItems)
    .orderBy(desc(litItems.releasedOn), desc(litItems.updatedAt))
    .limit(1000);

  const activeCount = rows.filter((item) => ['reading', 'queued', 'unread'].includes(item.readState)).length;
  const rankedCount = rows.filter((item) => item.lastRankedAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Literature"
        description="Reading queue grouped by topic. Most recent first within each bucket."
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
        <div className="space-y-4">
          {TOPIC_ORDER.map((topic) => {
            const items = rows.filter((row) => (row.topic ?? 'other') === topic.key);
            if (items.length === 0) return null;
            return (
              <Panel key={topic.key} className="overflow-hidden">
                <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-[--color-border] px-4 py-3">
                  <h2 className="text-sm font-semibold tracking-tight">
                    {topic.key === 'current_project' ? (
                      <span className="inline-flex items-center gap-1.5 text-[--color-accent]">
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        {topic.title}
                      </span>
                    ) : (
                      topic.title
                    )}
                  </h2>
                  <span className="text-xs text-[--color-muted]">{topic.description}</span>
                  <span className="ml-auto font-mono text-xs text-[--color-muted]">{items.length}</span>
                </div>
                <ul className="divide-y divide-[--color-border]">
                  {items.slice(0, 30).map((item) => {
                    const externalUrl = item.url ?? (item.arxivId ? `https://arxiv.org/abs/${item.arxivId}` : null);
                    return (
                      <li key={item.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <Link
                            href={`/e/lit_item/${item.id}`}
                            className="text-sm font-semibold leading-snug tracking-tight text-[--color-fg] hover:underline"
                          >
                            {item.title || '(untitled)'}
                          </Link>
                          {externalUrl ? (
                            <a
                              href={externalUrl}
                              target="_blank"
                              rel="noreferrer noopener"
                              className={cn(
                                'inline-flex items-center gap-1 text-xs text-[--color-muted] hover:text-[--color-fg]',
                              )}
                              aria-label="Open source"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              source
                            </a>
                          ) : null}
                          <span className="ml-auto inline-flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                            <StatusBadge status={item.readState} />
                            <span>{recencyLabel(item.releasedOn)}</span>
                            {item.arxivId ? <span className="font-mono">{item.arxivId}</span> : null}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[--color-muted]">{authorsText(item.authors)}</p>
                        {item.summaryMd ? (
                          <p className="mt-2 line-clamp-3 text-sm text-[--color-fg]/85">{item.summaryMd}</p>
                        ) : item.abstract ? (
                          <p className="mt-2 line-clamp-3 text-sm text-[--color-fg]/85">{item.abstract}</p>
                        ) : null}
                        {item.relevanceReasonMd ? (
                          <p className="mt-2 line-clamp-2 text-xs italic text-[--color-muted]">
                            <span className="font-semibold not-italic text-[--color-fg]/75">Why it matters: </span>
                            {item.relevanceReasonMd}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                  {items.length > 30 ? (
                    <li className="px-4 py-2 text-xs text-[--color-muted]">
                      +{items.length - 30} more — open the entity pages or filter by read state to see all.
                    </li>
                  ) : null}
                </ul>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
