import { desc, eq } from 'drizzle-orm';
import { litInbox, litItems, litSources } from '@sagan/db/schema';
import { db } from '@/lib/db';

export async function LiteratureIntelligencePanel({ litItemId }: { litItemId: string }) {
  const itemRows = await db()
    .select({
      summaryMd: litItems.summaryMd,
      relevanceReasonMd: litItems.relevanceReasonMd,
      threatReasonMd: litItems.threatReasonMd,
      lastRankedAt: litItems.lastRankedAt,
    })
    .from(litItems)
    .where(eq(litItems.id, litItemId))
    .limit(1);
  const item = itemRows[0];
  if (!item) return null;

  const inboxRows = await db()
    .select({
      score: litInbox.score,
      reasonMd: litInbox.reasonMd,
      surfacedOn: litInbox.surfacedOn,
      sourceTitle: litSources.title,
    })
    .from(litInbox)
    .leftJoin(litSources, eq(litInbox.sourceId, litSources.id))
    .where(eq(litInbox.litItemId, litItemId))
    .orderBy(desc(litInbox.surfacedOn), desc(litInbox.createdAt))
    .limit(3);

  if (!item.summaryMd && !item.relevanceReasonMd && !item.threatReasonMd && inboxRows.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Literature intelligence
        </h2>
        {item.lastRankedAt ? (
          <span className="text-xs text-[--color-muted]">
            ranked {item.lastRankedAt.toISOString().slice(0, 10)}
          </span>
        ) : null}
      </div>

      {item.summaryMd ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">Summary</h3>
          <p className="whitespace-pre-wrap text-sm">{item.summaryMd}</p>
        </div>
      ) : null}

      {item.relevanceReasonMd ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">Read next reason</h3>
          <p className="whitespace-pre-wrap text-sm">{item.relevanceReasonMd}</p>
        </div>
      ) : null}

      {item.threatReasonMd ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">Threat or caveat</h3>
          <p className="whitespace-pre-wrap text-sm">{item.threatReasonMd}</p>
        </div>
      ) : null}

      {inboxRows.length > 0 ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">Recent inbox appearances</h3>
          <ul className="space-y-1 text-sm">
            {inboxRows.map((row) => (
              <li key={`${row.surfacedOn}:${row.score}:${row.sourceTitle ?? 'source'}`}>
                <span className="font-mono text-xs text-[--color-muted]">{row.score ?? 0}</span>{' '}
                <span className="text-[--color-muted]">{row.surfacedOn}</span>{' '}
                <span>{row.reasonMd ?? row.sourceTitle ?? 'No reason recorded.'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
