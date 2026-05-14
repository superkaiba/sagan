import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { cleanResults, dailyLogEntries } from '@sagan/db/schema';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { MentorDailyLogBoard } from './MentorDailyLogBoard';

export const dynamic = 'force-dynamic';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MentorDailyPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!ISO_DATE_RE.test(date)) return notFound();
  const session = await getSession();
  if (!session) redirect(`/login?next=/mentor/daily/${date}`);

  const entries = await db()
    .select()
    .from(dailyLogEntries)
    .where(
      and(
        eq(dailyLogEntries.day, date),
        eq(dailyLogEntries.kind, 'clean_result'),
        isNull(dailyLogEntries.archivedAt),
      ),
    )
    .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt));

  const linkedCleanResultIds = Array.from(
    new Set(
      entries
        .filter((e) => e.entityKind === 'clean_result' && e.entityId)
        .map((e) => e.entityId as string),
    ),
  );
  const linkedCleanResultMap = new Map<
    string,
    { title: string; confidence: string | null }
  >();
  if (linkedCleanResultIds.length > 0) {
    const rows = await db()
      .select({
        id: cleanResults.id,
        title: cleanResults.title,
        confidence: cleanResults.confidence,
      })
      .from(cleanResults)
      .where(inArray(cleanResults.id, linkedCleanResultIds));
    for (const row of rows) {
      linkedCleanResultMap.set(row.id, { title: row.title, confidence: row.confidence });
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-6 border-b border-[--color-border] pb-4">
        <p className="text-xs font-medium text-[--color-muted]">Sagan mentor log</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{date}</h1>
          <Link href={`/digest/${date}`} className="text-xs text-[--color-muted] hover:text-[--color-fg]">
            Full log
          </Link>
        </div>
      </header>

      {entries.length === 0 ? (
        <MentorDailyLogBoard date={date} entries={[]} signedIn={Boolean(session)} />
      ) : (
        <MentorDailyLogBoard
          date={date}
          signedIn={Boolean(session)}
          entries={entries.map((entry) => {
            const linked =
              entry.entityKind === 'clean_result' && entry.entityId
                ? linkedCleanResultMap.get(entry.entityId) ?? null
                : null;
            return {
              id: entry.id,
              day: entry.day,
              kind: entry.kind,
              bodyMd: entry.bodyMd,
              entityKind: entry.entityKind,
              entityId: entry.entityId,
              position: entry.position,
              createdAt: entry.createdAt.toISOString(),
              updatedAt: entry.updatedAt.toISOString(),
              linkedTitle: linked?.title ?? null,
              linkedConfidence: linked?.confidence ?? null,
            };
          })}
        />
      )}

      <footer className="mt-8 border-t border-[--color-border] pt-4 text-[10px] text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
