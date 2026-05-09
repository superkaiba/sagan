import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { weeklyDigests } from '@eps/db/schema';
import { db } from '@/lib/db';
import { GenerateDigestButton } from './GenerateDigestButton';

export const dynamic = 'force-dynamic';

export default async function DigestsPage() {
  const rows = await db()
    .select()
    .from(weeklyDigests)
    .orderBy(desc(weeklyDigests.weekStart))
    .limit(52);

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Weekly digests</h1>
        <GenerateDigestButton />
      </header>

      <p className="text-sm text-[--color-muted]">
        Drafted automatically Sunday 22:00 (server time). Edit Monday morning, then copy the public
        link to share with your advisor. Press Generate to draft now.
      </p>

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">No digests yet.</p>
        ) : (
          rows.map((d) => (
            <Link
              key={d.id}
              href={`/digests/${d.id}`}
              className="block px-4 py-3 hover:bg-[--color-muted-bg]"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">Week of {d.weekStart}</h2>
                <span className="text-xs text-[--color-muted]">
                  {d.editedAt ? 'edited' : 'draft'}
                  {d.sentAt ? ' · sent' : ''}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-[--color-muted]">
                {d.bodyMd.slice(0, 200)}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
