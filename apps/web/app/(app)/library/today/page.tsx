import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { RunLitReviewButton } from './RunLitReviewButton';

export const dynamic = 'force-dynamic';

const CATEGORY_META = [
  {
    key: 'linked_to_results',
    title: 'Linked to your results',
    tone: 'border-l-emerald-500 bg-emerald-500/10',
    label: 'text-emerald-700 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  {
    key: 'new_research',
    title: 'New research',
    tone: 'border-l-sky-500 bg-sky-500/10',
    label: 'text-sky-700 dark:text-sky-200',
    dot: 'bg-sky-500',
  },
  {
    key: 'threats',
    title: 'Threats and caveats',
    tone: 'border-l-rose-500 bg-rose-500/10',
    label: 'text-rose-700 dark:text-rose-200',
    dot: 'bg-rose-500',
  },
  {
    key: 'methods',
    title: 'Methods',
    tone: 'border-l-violet-500 bg-violet-500/10',
    label: 'text-violet-700 dark:text-violet-200',
    dot: 'bg-violet-500',
  },
  {
    key: 'foundational',
    title: 'Older / foundational',
    tone: 'border-l-amber-500 bg-amber-500/10',
    label: 'text-amber-800 dark:text-amber-100',
    dot: 'bg-amber-500',
  },
  {
    key: 'general_important',
    title: 'General important',
    tone: 'border-l-indigo-500 bg-indigo-500/10',
    label: 'text-indigo-700 dark:text-indigo-200',
    dot: 'bg-indigo-500',
  },
] as const;

type CategoryKey = (typeof CATEGORY_META)[number]['key'];

const CATEGORY_KEYS = new Set<string>(CATEGORY_META.map((category) => category.key));

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

function normalizeCategory(value: string | null): CategoryKey {
  return value && CATEGORY_KEYS.has(value) ? (value as CategoryKey) : 'new_research';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : todayIso();
}

function shiftedDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function LibraryTodayPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedDate = normalizeDateParam(params.date);
  const today = todayIso();

  const rows = await db()
    .select({
      inboxId: litInbox.id,
      score: litInbox.score,
      category: litInbox.category,
      reason: litInbox.reasonMd,
      surfacedOn: litInbox.surfacedOn,
      sourceId: litInbox.sourceId,
      sourceTitle: litSources.title,
      itemId: litItems.id,
      title: litItems.title,
      authors: litItems.authors,
      releasedOn: litItems.releasedOn,
      arxivId: litItems.arxivId,
      url: litItems.url,
      readState: litItems.readState,
      abstract: litItems.abstract,
      summaryMd: litItems.summaryMd,
      relevanceReasonMd: litItems.relevanceReasonMd,
      threatReasonMd: litItems.threatReasonMd,
    })
    .from(litInbox)
    .innerJoin(litItems, eq(litInbox.litItemId, litItems.id))
    .leftJoin(litSources, eq(litInbox.sourceId, litSources.id))
    .where(and(eq(litInbox.surfacedOn, selectedDate), isNull(litInbox.dismissedAt)))
    .orderBy(desc(litInbox.score), desc(litInbox.createdAt));

  const sources = await db()
    .select({ id: litSources.id, title: litSources.title, lastPolledAt: litSources.lastPolledAt })
    .from(litSources)
    .where(eq(litSources.enabled, true));

  const rowsByCategory = new Map<CategoryKey, typeof rows>();
  for (const meta of CATEGORY_META) rowsByCategory.set(meta.key, []);
  for (const row of rows) {
    rowsByCategory.get(normalizeCategory(row.category))!.push(row);
  }
  const visibleCategories = CATEGORY_META.map((meta) => ({
    ...meta,
    items: rowsByCategory.get(meta.key) ?? [],
  })).filter((section) => section.items.length > 0);
  const sourceCount = new Set(rows.map((row) => row.sourceId ?? row.sourceTitle ?? 'unknown')).size;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <Link href="/library" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            ← all library
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Daily reading queue</h1>
          <p className="text-sm text-[--color-muted]">
            {rows.length} item{rows.length === 1 ? '' : 's'} for {selectedDate}
            {rows.length > 0 ? ` across ${visibleCategories.length} categor${visibleCategories.length === 1 ? 'y' : 'ies'}` : ''}
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/library/today?date=${shiftedDate(selectedDate, -1)}`}
            className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs hover:bg-[--color-hover]"
          >
            Previous
          </Link>
          <form action="/library/today" className="flex items-center gap-2">
            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="h-8 rounded-md border border-[--color-border] bg-[--color-panel] px-2 text-xs"
            />
            <button
              type="submit"
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs hover:bg-[--color-hover]"
            >
              Go
            </button>
          </form>
          {selectedDate !== today ? (
            <Link
              href="/library/today"
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs hover:bg-[--color-hover]"
            >
              Today
            </Link>
          ) : null}
          <Link
            href={`/library/today?date=${shiftedDate(selectedDate, 1)}`}
            className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs hover:bg-[--color-hover]"
          >
            Next
          </Link>
          <RunLitReviewButton />
        </div>
      </header>

      <p className="text-sm text-[--color-muted]">
        Active sources: {sources.length}. Sources represented in this queue: {rows.length > 0 ? sourceCount : 0}.
        The cron runs daily at 06:00 server time; arxiv RSS is often empty on weekends.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
          Nothing surfaced for {selectedDate}. Run the lit review for today, or pick another date.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleCategories.map((section) => (
            <section key={section.key} className={`border-l-4 ${section.tone} rounded-r-lg border-y border-r border-[--color-border]`}>
              <header className="flex items-center justify-between border-b border-[--color-border] bg-[--color-panel]/60 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${section.dot}`} aria-hidden="true" />
                  <h2 className={`text-sm font-semibold ${section.label}`}>{section.title}</h2>
                </div>
                <span className="text-xs text-[--color-muted]">{section.items.length}</span>
              </header>
              <ol className="divide-y divide-[--color-border] bg-[--color-panel]/45">
                {section.items.map((r) => (
                  <li key={r.inboxId} className="p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                      <span className="rounded-full bg-[--color-bg] px-2 py-0.5 font-medium">
                        score {r.score ?? 0}
                      </span>
                      <span>{r.sourceTitle ?? 'unknown source'}</span>
                      {r.arxivId ? <span>arxiv:{r.arxivId}</span> : null}
                      <span className="ml-auto rounded-full bg-[--color-muted-bg] px-2 py-0.5">{r.readState}</span>
                    </div>
                    <h3 className="mt-2 text-base font-medium">
                      <Link href={`/e/lit_item/${r.itemId}`} className="hover:underline">
                        {r.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-xs text-[--color-muted]">
                      {authorsText(r.authors)} · {releaseDateText(r.releasedOn)}
                    </p>
                    {r.summaryMd ? <p className="mt-2 line-clamp-3 text-sm">{r.summaryMd}</p> : null}
                    {r.reason ?? r.relevanceReasonMd ? (
                      <p className="mt-2 text-sm">{r.reason ?? r.relevanceReasonMd}</p>
                    ) : null}
                    {r.abstract ? <p className="mt-2 line-clamp-3 text-xs text-[--color-muted]">{r.abstract}</p> : null}
                    {r.threatReasonMd ? (
                      <p className="mt-2 text-xs text-[--color-danger]">{r.threatReasonMd}</p>
                    ) : null}
                    <div className="mt-3 flex items-center gap-3 text-xs">
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[--color-accent] hover:underline"
                        >
                          source ↗
                        </a>
                      ) : null}
                      <Link href={`/e/lit_item/${r.itemId}`} className="text-[--color-muted] hover:text-[--color-fg]">
                        open
                      </Link>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
