import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { projects, beliefs } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { NewProjectForm } from './NewProjectForm';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const [allProjects, allBeliefs] = await Promise.all([
    db().select().from(projects).orderBy(desc(projects.updatedAt)),
    db().select({ projectId: beliefs.projectId, id: beliefs.id }).from(beliefs),
  ]);
  const beliefCount = new Map<string, number>();
  for (const b of allBeliefs) {
    if (!b.projectId) continue;
    beliefCount.set(b.projectId, (beliefCount.get(b.projectId) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-[--color-muted]">{allProjects.length}</p>
      </header>

      <NewProjectForm />

      <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
        {allProjects.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">No projects yet. Create one above.</p>
        ) : (
          allProjects.map((p) => (
            <Link
              key={p.id}
              href={`/e/project/${p.id}`}
              className="block px-4 py-3 hover:bg-[--color-muted-bg]"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">{p.title}</h2>
                <span className="text-xs text-[--color-muted]">{p.status}</span>
              </div>
              <p className="mt-1 text-xs text-[--color-muted]">
                {p.slug} · {beliefCount.get(p.id) ?? 0} belief{(beliefCount.get(p.id) ?? 0) === 1 ? '' : 's'}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
