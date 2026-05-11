import Link from 'next/link';
import { desc, eq, inArray } from 'drizzle-orm';
import { beliefs, cleanResults, experiments, projectNarratives } from '@sagan/db/schema';
import { db } from '@/lib/db';

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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
      <ChildList title={`Beliefs (${bel.length})`}>
        {bel.map((b) => (
          <li key={b.id}>
            <Link href={`/e/belief/${b.id}`} className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]">
              <span className="block truncate">{b.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">
                {b.confidence} · {b.status}
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Experiments (${exp.length})`}>
        {exp.map((e) => (
          <li key={e.id}>
            <Link href={`/e/experiment/${e.id}`} className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]">
              <span className="block truncate">{e.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">{e.status}</span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Clean results (${resultRows.length})`}>
        {resultRows.map((r) => (
          <li key={r.id}>
            <Link href={`/clean-results/${r.id}`} className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]">
              <span className="block truncate">{r.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">
                {r.confidence ?? 'unset'} · {r.status}
              </span>
            </Link>
          </li>
        ))}
      </ChildList>
      <ChildList title={`Narratives (${narr.length})`}>
        {narr.map((n) => (
          <li key={n.id}>
            <Link
              href={`/e/project_narrative/${n.id}`}
              className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]"
            >
              <span className="block truncate">{n.title}</span>
              <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">{n.status}</span>
            </Link>
          </li>
        ))}
      </ChildList>
    </div>
  );
}

function ChildList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3 space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[--color-muted]">{title}</h3>
      <ul className="space-y-0.5">{children}</ul>
    </section>
  );
}
