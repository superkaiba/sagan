import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { projectNarratives, projects } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';

/**
 * Public project view: renders the latest published narrative for a project
 * marked `public = true`. Anyone with the URL can view (no auth).
 *
 * Future additions:
 * - share_token query param for non-public projects
 * - version history sidebar (archived narratives)
 * - in-page experiment overlays on issue/clean-result links
 */
export default async function PublicProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const projectRows = await db()
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  const project = projectRows[0];
  if (!project || !project.public) return notFound();

  const narrativeRows = await db()
    .select()
    .from(projectNarratives)
    .where(
      and(
        eq(projectNarratives.projectId, project.id),
        eq(projectNarratives.status, 'published'),
      ),
    )
    .orderBy(desc(projectNarratives.publishedAt))
    .limit(1);
  const narrative = narrativeRows[0];

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Project</p>
        <h1 className="text-3xl font-semibold tracking-tight">{project.title}</h1>
        {narrative?.publishedAt ? (
          <p className="text-xs text-[--color-muted]">
            Updated {new Date(narrative.publishedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        ) : null}
      </header>

      {narrative ? (
        <article className="rounded-lg border border-[--color-border] bg-[--color-panel] p-6">
          {narrative.title && narrative.title !== project.title ? (
            <h2 className="mb-4 text-lg font-medium text-[--color-muted]">{narrative.title}</h2>
          ) : null}
          <Markdown>{narrative.bodyMd}</Markdown>
        </article>
      ) : project.summaryMd ? (
        <article className="rounded-lg border border-[--color-border] bg-[--color-panel] p-6">
          <Markdown>{project.summaryMd}</Markdown>
        </article>
      ) : (
        <p className="text-sm text-[--color-muted]">No published narrative yet.</p>
      )}

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}
