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

export default async function ArchivedDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!ISO_DATE_RE.test(date)) return notFound();

  const today = new Date().toISOString().slice(0, 10);
  const entries = await db()
    .select()
    .from(dailyLogEntries)
    .where(and(eq(dailyLogEntries.day, date), isNull(dailyLogEntries.archivedAt)))
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));

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
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Research log
        </h2>
        <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
          {entries.length === 0 ? (
            <p className="p-4 text-sm text-[--color-muted]">Nothing was logged on this day.</p>
          ) : (
            entries.map((entry) => {
              const badge = KIND_BADGES[entry.kind] ?? KIND_BADGES.note!;
              return (
                <article key={entry.id} className="space-y-1 p-3 text-sm">
                  <div className="flex items-baseline gap-3 text-xs">
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
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
    </div>
  );
}
