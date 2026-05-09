import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import Link from 'next/link';
import { beliefVersions, beliefs } from '@eps/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';

interface Snapshot {
  title?: string;
  currentBelief?: string | null;
  evidence?: string | null;
  status?: string;
  confidence?: string;
}

export default async function BeliefHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const beliefRow = await db().select().from(beliefs).where(eq(beliefs.id, id)).limit(1);
  if (beliefRow.length === 0) return notFound();
  const versions = await db()
    .select()
    .from(beliefVersions)
    .where(eq(beliefVersions.beliefId, id))
    .orderBy(desc(beliefVersions.editedAt));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/e/belief/${id}`}
          className="text-xs text-[--color-muted] hover:text-[--color-fg]"
        >
          ← back to belief
        </Link>
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Belief history</p>
        <h1 className="text-2xl font-semibold tracking-tight">{beliefRow[0]!.title}</h1>
        <p className="text-sm text-[--color-muted]">
          {versions.length} prior edit{versions.length === 1 ? '' : 's'} captured
        </p>
      </header>

      {versions.length === 0 ? (
        <p className="text-sm text-[--color-muted]">No prior versions. Edits to this belief will start being captured from now on.</p>
      ) : (
        <ol className="space-y-4">
          {versions.map((v) => {
            const snap = v.snapshot as Snapshot;
            return (
              <li key={v.id} className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4 space-y-2">
                <div className="flex items-baseline justify-between text-xs text-[--color-muted]">
                  <time>{new Date(v.editedAt).toLocaleString()}</time>
                  <span>
                    {snap.confidence ? `${snap.confidence} · ` : ''}
                    {snap.status ?? '—'}
                  </span>
                </div>
                {snap.title && snap.title !== beliefRow[0]!.title ? (
                  <p className="text-sm font-medium">{snap.title}</p>
                ) : null}
                {snap.currentBelief ? <Markdown>{snap.currentBelief}</Markdown> : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
