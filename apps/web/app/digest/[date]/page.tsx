import { notFound } from 'next/navigation';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { dailyLogEntries } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{date}</h1>
          <a href={`/mentor/daily/${date}`} className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            clean results only
          </a>
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="text-sm text-[--color-muted]">No entries.</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-2"
              >
                <div className="flex items-baseline gap-3 text-xs">
                  <StatusBadge status={entry.kind} />
                  <time className="text-[--color-muted]">
                    {new Date(entry.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
                <Markdown>{entry.bodyMd}</Markdown>
              </li>
          ))}
        </ol>
      )}

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
