import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KIND_BADGES: Record<string, { label: string; bg: string }> = {
  clean_result: { label: 'result', bg: 'oklch(0.86 0.13 150)' },
  blocker: { label: 'blocker', bg: 'oklch(0.86 0.13 25)' },
  decision: { label: 'decision', bg: 'oklch(0.86 0.13 250)' },
  note: { label: 'note', bg: 'oklch(0.88 0.04 270)' },
};
const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;

function isActionTrail(entry: { bodyMd: string }) {
  return ACTION_PREFIX_RE.test(entry.bodyMd);
}

function EntryList({
  title,
  description,
  entries,
  empty,
}: {
  title: string;
  description: string;
  entries: typeof dailyLogEntries.$inferSelect[];
  empty: string;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-xs text-[--color-muted]">{description}</p>
        </div>
        <span className="font-mono text-xs text-[--color-muted]">{entries.length}</span>
      </div>
      <div className="divide-y divide-[--color-border] rounded-lg border border-[--color-border]">
        {entries.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">{empty}</p>
        ) : (
          entries.map((entry) => {
            const badge = KIND_BADGES[entry.kind] ?? KIND_BADGES.note!;
            return (
              <article key={entry.id} className="space-y-2 p-3 text-sm">
                <div className="flex items-baseline gap-3 text-xs">
                  <span
                    className="inline-block rounded-md px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: badge.bg, color: 'oklch(0.20 0.04 270)' }}
                  >
                    {badge.label}
                  </span>
                  <time className="text-[--color-muted]">
                    {new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <Markdown>{entry.bodyMd}</Markdown>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

export default async function ArchivedDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE_RE.test(date)) return notFound();

  const today = new Date().toISOString().slice(0, 10);
  const entries = await db()
    .select()
    .from(dailyLogEntries)
    .where(and(eq(dailyLogEntries.day, date), isNull(dailyLogEntries.archivedAt)))
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));
  const newest = entries.slice().reverse();
  const cleanResults = newest.filter((entry) => entry.kind === 'clean_result');
  const actionTrail = newest.filter(isActionTrail);
  const researchEntries = newest.filter((entry) => entry.kind !== 'clean_result' && !isActionTrail(entry));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/today" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
          ← back to today
        </Link>
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">{date}</h1>
          {date === today ? (
            <span className="text-xs text-[--color-muted]">live · /today is the editable view</span>
          ) : null}
        </div>
        <p className="text-sm text-[--color-muted]">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'} ·{' '}
          <Link href={`/digest/${date}`} className="hover:text-[--color-fg]">
            shareable link
          </Link>
          {' · '}
          <Link href={`/mentor/daily/${date}`} className="hover:text-[--color-fg]">
            mentor clean log
          </Link>
        </p>
      </header>

      <EntryList
        title="Research entries"
        description="Notes, decisions, and blockers from the day."
        entries={researchEntries}
        empty="No research entries were logged on this day."
      />
      <EntryList
        title="Clean results"
        description="Mentor-facing results saved from the day."
        entries={cleanResults}
        empty="No clean results were saved on this day."
      />
      <EntryList
        title="Action trail"
        description="System and workflow actions recorded with reasons."
        entries={actionTrail}
        empty="No action-trail entries were logged on this day."
      />
    </div>
  );
}
