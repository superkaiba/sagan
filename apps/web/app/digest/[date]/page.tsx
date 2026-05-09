import { notFound } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { dailyLogEntries } from '@eps/db/schema';
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

/**
 * Public, no-auth daily digest. Add a ?token=… check here when sharing
 * granularity matters; for now the URL is the access control (opaque
 * dates are guessable, but this is fine for personal-use sharing).
 */
export default async function PublicDigestPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!ISO_DATE_RE.test(date)) return notFound();

  const entries = await db()
    .select()
    .from(dailyLogEntries)
    .where(and(eq(dailyLogEntries.day, date), isNull(dailyLogEntries.archivedAt)))
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Research digest</p>
        <h1 className="text-2xl font-semibold tracking-tight">{date}</h1>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-[--color-muted]">No entries.</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => {
            const badge = KIND_BADGES[entry.kind] ?? KIND_BADGES.note!;
            return (
              <li
                key={entry.id}
                className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-2"
              >
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
              </li>
            );
          })}
        </ol>
      )}

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        EPS Research Dashboard
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
