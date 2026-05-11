import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { cleanResults } from '@sagan/db/schema';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CleanResultsPage() {
  const rows = await db().select().from(cleanResults).orderBy(desc(cleanResults.updatedAt)).limit(100);
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Clean Results</h1>
        <p className="text-sm text-[--color-muted]">{rows.length} recent result{rows.length === 1 ? '' : 's'}</p>
      </header>
      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">No clean results yet.</p>
        ) : (
          rows.map((result) => (
            <Link key={result.id} href={`/clean-results/${result.id}`} className="block p-4 hover:bg-[--color-muted-bg]">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{result.status}</span>
                {result.confidence ? (
                  <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{result.confidence}</span>
                ) : null}
                <h2 className="font-medium">{result.title}</h2>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">{result.claim}</p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
