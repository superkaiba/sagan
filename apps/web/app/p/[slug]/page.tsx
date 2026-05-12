import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, desc, eq, or } from 'drizzle-orm';
import { projectNarratives, projects } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { Comments } from '@/components/Comments';
import { ImproveNarrativeButton } from '@/components/ImproveNarrativeButton';
import { Markdown } from '@/components/Markdown';
import { NarrativeVersionSelector } from '@/components/NarrativeVersionSelector';

export const dynamic = 'force-dynamic';

/**
 * Public project view. Renders the latest published narrative for any project
 * with `public = true`, or a specific archived version when `?v=<narrativeId>`
 * is passed. Layout is two-column on desktop — article on the left, discussion
 * (comments + Improve button) on the right, sticky so it stays visible while
 * scrolling. Single column on mobile.
 *
 * Future additions:
 * - share_token query param for non-public projects
 * - in-page experiment overlays on issue/clean-result links
 */
export default async function PublicProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const [{ slug }, { v: versionParam }] = await Promise.all([params, searchParams]);

  const projectRows = await db()
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  const project = projectRows[0];
  if (!project || !project.public) return notFound();

  // Pull every narrative for this project, ordered current-first then by date.
  const allNarratives = await db()
    .select({
      id: projectNarratives.id,
      title: projectNarratives.title,
      bodyMd: projectNarratives.bodyMd,
      status: projectNarratives.status,
      publishedAt: projectNarratives.publishedAt,
      createdAt: projectNarratives.createdAt,
    })
    .from(projectNarratives)
    .where(
      and(
        eq(projectNarratives.projectId, project.id),
        or(
          eq(projectNarratives.status, 'published'),
          eq(projectNarratives.status, 'archived'),
        ),
      ),
    )
    .orderBy(desc(projectNarratives.publishedAt));

  const currentNarrative = allNarratives.find((n) => n.status === 'published') ?? null;
  const requestedNarrative = versionParam
    ? allNarratives.find((n) => n.id === versionParam) ?? null
    : null;
  const narrative = requestedNarrative ?? currentNarrative;
  const isViewingCurrent = narrative !== null && narrative.id === currentNarrative?.id;
  const session = await getSession();

  const versions = allNarratives.map((n) => ({
    id: n.id,
    title: n.title,
    status: n.status,
    publishedAt: n.publishedAt?.toISOString() ?? null,
    isCurrent: n.id === currentNarrative?.id,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Project</p>
        <h1 className="text-4xl font-semibold tracking-tight">{project.title}</h1>
        <div className="flex flex-wrap items-center gap-4">
          {narrative?.publishedAt ? (
            <p className="text-base text-[--color-muted]">
              Updated{' '}
              <time dateTime={narrative.publishedAt.toISOString()}>
                {new Date(narrative.publishedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </p>
          ) : null}
          {versions.length > 1 && narrative ? (
            <NarrativeVersionSelector
              versions={versions}
              selectedId={narrative.id}
              basePath={`/p/${slug}`}
            />
          ) : null}
          {!isViewingCurrent && narrative ? (
            <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs text-[--color-muted]">
              archived version
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-6 min-w-0">
          {narrative ? (
            <article className="rounded-lg border border-[--color-border] bg-[--color-panel] p-6">
              <Markdown>{narrative.bodyMd}</Markdown>
            </article>
          ) : project.summaryMd ? (
            <article className="rounded-lg border border-[--color-border] bg-[--color-panel] p-6">
              <Markdown>{project.summaryMd}</Markdown>
            </article>
          ) : (
            <p className="text-sm text-[--color-muted]">No published narrative yet.</p>
          )}
        </div>

        {narrative ? (
          <aside className="lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Discussion</h2>
              {session && isViewingCurrent ? (
                <ImproveNarrativeButton narrativeId={narrative.id} />
              ) : null}
            </div>
            {!isViewingCurrent ? (
              <p className="rounded-md bg-[--color-muted-bg] px-3 py-2 text-xs text-[--color-muted]">
                Viewing an archived version. Switch to <strong>current</strong> to leave comments
                or run an Improve pass.
              </p>
            ) : session ? (
              <Comments entityKind="project_narrative" entityId={narrative.id} />
            ) : (
              <p className="text-sm text-[--color-muted]">
                <Link href="/login" className="underline">
                  Sign in
                </Link>{' '}
                to leave comments. Click <strong>Improve</strong> after commenting to have all
                unresolved feedback addressed in a new draft.
              </p>
            )}
          </aside>
        ) : null}
      </div>

      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}
