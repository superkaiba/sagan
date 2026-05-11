import Link from 'next/link';
import { desc, eq, inArray } from 'drizzle-orm';
import { beliefs, cleanResults, experiments, projectNarratives } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Panel, StatusBadge } from '@/components/ui';

export async function ProjectChildren({ projectId }: { projectId: string }) {
  const [bel, exp, narr] = await Promise.all([
    db()
      .select({
        id: beliefs.id,
        title: beliefs.title,
        confidence: beliefs.confidence,
        status: beliefs.status,
      })
      .from(beliefs)
      .where(eq(beliefs.projectId, projectId))
      .orderBy(desc(beliefs.updatedAt)),
    db()
      .select({ id: experiments.id, title: experiments.title, status: experiments.status })
      .from(experiments)
      .where(eq(experiments.projectId, projectId))
      .orderBy(desc(experiments.updatedAt)),
    db()
      .select({
        id: projectNarratives.id,
        title: projectNarratives.title,
        status: projectNarratives.status,
        publishedAt: projectNarratives.publishedAt,
      })
      .from(projectNarratives)
      .where(eq(projectNarratives.projectId, projectId))
      .orderBy(desc(projectNarratives.updatedAt)),
  ]);
  const resultRows = exp.length
    ? await db()
        .select({
          id: cleanResults.id,
          title: cleanResults.title,
          status: cleanResults.status,
          confidence: cleanResults.confidence,
        })
        .from(cleanResults)
        .where(inArray(cleanResults.experimentId, exp.map((e) => e.id)))
        .orderBy(desc(cleanResults.updatedAt))
    : [];

  if (bel.length === 0 && exp.length === 0 && narr.length === 0 && resultRows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      <ChildList title={`Beliefs (${bel.length})`}>
        {bel.length === 0 ? <EmptyChild /> : null}
        {bel.map((b) => (
          <li key={b.id} className="min-w-0">
            <Link href={`/e/belief/${b.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-[--color-hover]">
              <span className="block truncate">{b.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                <StatusBadge status={b.status} />
                <span>{b.confidence}</span>
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Experiments (${exp.length})`}>
        {exp.length === 0 ? <EmptyChild /> : null}
        {exp.map((e) => (
          <li key={e.id} className="min-w-0">
            <Link href={`/e/experiment/${e.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-[--color-hover]">
              <span className="block truncate">{e.title}</span>
              <span className="mt-1 block">
                <StatusBadge status={e.status} />
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Clean results (${resultRows.length})`}>
        {resultRows.length === 0 ? <EmptyChild /> : null}
        {resultRows.map((r) => (
          <li key={r.id} className="min-w-0">
            <Link href={`/clean-results/${r.id}`} className="block rounded-md px-2 py-2 text-sm hover:bg-[--color-hover]">
              <span className="block truncate">{r.title}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[--color-muted]">
                <StatusBadge status={r.status} />
                <span>{r.confidence ?? 'unset'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Narratives (${narr.length})`}>
        {narr.length === 0 ? <EmptyChild /> : null}
        {narr.map((n) => (
          <li key={n.id} className="min-w-0">
            <Link
              href={`/e/project_narrative/${n.id}`}
              className="block rounded-md px-2 py-2 text-sm hover:bg-[--color-hover]"
            >
              <span className="block truncate">{n.title}</span>
              <span className="mt-1 block">
                <StatusBadge status={n.status} />
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
    </div>
  );
}

function ChildList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="space-y-1 p-3">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </Panel>
  );
}

function EmptyChild() {
  return <li className="px-2 py-2 text-sm text-[--color-muted]">None yet.</li>;
}
