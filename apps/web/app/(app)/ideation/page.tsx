import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { ideaSessions } from '@sagan/db/schema';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function IdeationPage() {
  const sessions = await db()
    .select()
    .from(ideaSessions)
    .orderBy(desc(ideaSessions.updatedAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ideation</h1>
          <p className="text-sm text-[--color-muted]">{sessions.length} session{sessions.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[--color-border] p-6 text-sm text-[--color-muted]">
            No sessions yet.
          </div>
        ) : (
          sessions.map((session) => (
            <Link
              key={session.id}
              href={`/ideation/${session.id}`}
              className="block space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 hover:bg-[--color-panel]"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-medium">{session.title}</h2>
                <span className="rounded-full bg-[--color-bg] px-2 py-0.5 text-[10px] uppercase tracking-wide">
                  {session.status}
                </span>
              </div>
              <p className="font-mono text-xs text-[--color-muted]">
                {session.sourceKind}:{session.sourceId.slice(0, 8)}
              </p>
              <p className="text-xs text-[--color-muted]">
                {session.updatedAt.toISOString().slice(0, 10)}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
