import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { RunLitReviewButton } from './RunLitReviewButton';

export const dynamic = 'force-dynamic';

export default async function LibraryTodayPage() {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db()
    .select({
      inboxId: litInbox.id,
      score: litInbox.score,
      reason: litInbox.reasonMd,
      surfacedOn: litInbox.surfacedOn,
      sourceId: litInbox.sourceId,
      sourceTitle: litSources.title,
      itemId: litItems.id,
      title: litItems.title,
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
    .where(and(eq(litInbox.surfacedOn, today), isNull(litInbox.dismissedAt)))
    .orderBy(desc(litInbox.score), desc(litInbox.createdAt));

  const sources = await db()
    .select({ id: litSources.id, title: litSources.title, lastPolledAt: litSources.lastPolledAt })
    .from(litSources)
    .where(eq(litSources.enabled, true));

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div className="space-y-1">
          <Link href="/library" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            ← all library
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Today's lit review</h1>
        </div>
        <RunLitReviewButton />
      </header>

      <p className="text-sm text-[--color-muted]">
        {rows.length} paper{rows.length === 1 ? '' : 's'} surfaced from {sources.length} source
        {sources.length === 1 ? '' : 's'}. The cron runs daily at 06:00 server time. arxiv RSS is empty
        on weekends.
      </p>

      <ol className="space-y-3">
        {rows.length === 0 ? (
          <li className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
            Nothing surfaced today. Click "Run lit review" to poll the configured sources now, or wait
            for the 06:00 cron.
          </li>
        ) : (
          rows.map((r) => (
            <li
              key={r.inboxId}
              className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-1"
            >
              <div className="flex items-baseline gap-3 text-xs text-[--color-muted]">
                <span className="rounded-full bg-[--color-bg] px-2 py-0.5 font-medium">
                  score {r.score ?? 0}
                </span>
                <span>{r.sourceTitle ?? 'unknown source'}</span>
                {r.arxivId ? <span>arxiv:{r.arxivId}</span> : null}
                <span className="ml-auto">{r.readState}</span>
              </div>
              <h2 className="text-base font-medium">
                <Link href={`/e/lit_item/${r.itemId}`} className="hover:underline">
                  {r.title}
                </Link>
              </h2>
              {r.summaryMd ?? r.abstract ? (
                <p className="line-clamp-3 text-sm text-[--color-muted]">{r.summaryMd ?? r.abstract}</p>
              ) : null}
              {r.reason ?? r.relevanceReasonMd ? (
                <p className="text-sm">{r.reason ?? r.relevanceReasonMd}</p>
              ) : null}
              {r.threatReasonMd ? (
                <p className="text-xs text-[--color-muted]">{r.threatReasonMd}</p>
              ) : null}
              <div className="flex items-center gap-3 text-xs">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[--color-accent] hover:underline">
                    arxiv ↗
                  </a>
                ) : null}
                <Link href={`/e/lit_item/${r.itemId}`} className="text-[--color-muted] hover:text-[--color-fg]">
                  open
                </Link>
              </div>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
