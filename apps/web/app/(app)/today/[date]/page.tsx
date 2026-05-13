import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
          entries.map((entry) => (
              <article key={entry.id} className="space-y-2 p-3 text-sm">
                <div className="flex items-baseline gap-3 text-xs">
                  <StatusBadge status={entry.kind} />
                  <time className="text-[--color-muted]">
                    {new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <Link
                    href={`/e/daily_log_entry/${entry.id}`}
                    className="ml-auto text-[--color-muted] hover:text-[--color-fg]"
                  >
                    open · discuss →
                  </Link>
                </div>
                <Markdown>{entry.bodyMd}</Markdown>
              </article>
          ))
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
