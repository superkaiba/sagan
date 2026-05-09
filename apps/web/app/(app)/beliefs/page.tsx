import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { beliefs, projects } from '@eps/db/schema';
import { db } from '@/lib/db';
import { NewBeliefForm } from './NewBeliefForm';

export const dynamic = 'force-dynamic';

export default async function BeliefsPage() {
  const [allBeliefs, allProjects] = await Promise.all([
    db().select().from(beliefs).orderBy(desc(beliefs.updatedAt)),
    db().select({ id: projects.id, title: projects.title }).from(projects),
  ]);
  const projectTitle = new Map(allProjects.map((p) => [p.id, p.title]));

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Beliefs</h1>
        <p className="text-sm text-[--color-muted]">{allBeliefs.length}</p>
      </header>

      <NewBeliefForm projects={allProjects} />

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {allBeliefs.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">No beliefs yet.</p>
        ) : (
          allBeliefs.map((b) => (
            <Link
              key={b.id}
              href={`/e/belief/${b.id}`}
              className="block px-4 py-3 hover:bg-[--color-muted-bg]"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">{b.title}</h2>
                <span className="text-xs text-[--color-muted]">
                  {b.confidence} · {b.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-[--color-muted]">
                {b.projectId ? projectTitle.get(b.projectId) ?? '—' : 'no project'}
                {b.topic ? ` · ${b.topic}` : null}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
