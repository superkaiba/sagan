import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { FileText, FolderOpen, FlaskConical, Share2 } from 'lucide-react';
import { beliefs, experiments, projectNarratives, projects } from '@sagan/db/schema';
import { EmptyState, MetricTile, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { NewProjectForm } from './NewProjectForm';

export const dynamic = 'force-dynamic';

function stripMarkdownInline(s: string): string {
  return s
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function taglineFromMarkdown(md: string | null | undefined): string | null {
  if (!md) return null;
  // Match a leading italic single-line tagline, e.g. "*A cheap, computable distance metric…*"
  const m = md.match(/^\s*\*([^*\n]+)\*\s*$/m);
  return m?.[1] ? m[1].trim() : null;
}

function sectionContent(md: string, headingPatterns: RegExp[]): string | null {
  for (const pattern of headingPatterns) {
    const m = md.match(pattern);
    if (m?.[1]) {
      const content = m[1].trim();
      if (content) return content;
    }
  }
  return null;
}

function motivationFromMarkdown(md: string | null | undefined): string | null {
  if (!md) return null;
  // Priority order: "## Why" → "## Why it matters" → "## Question".
  const content = sectionContent(md, [
    /^##\s+Why\s*\n+([\s\S]*?)(?=\n##\s|$)/m,
    /^##\s+Why it matters\s*\n+([\s\S]*?)(?=\n##\s|$)/m,
    /^##\s+Question\s*\n+([\s\S]*?)(?=\n##\s|$)/m,
  ]);
  if (!content) return null;
  const firstParagraph = content.split(/\n{2,}/)[0]?.trim();
  if (!firstParagraph) return null;
  return stripMarkdownInline(firstParagraph);
}

function contributionFromMarkdown(md: string | null | undefined): string | null {
  if (!md) return null;
  const m = md.match(/^#{2,3}\s+What this project adds\s*\n+([\s\S]*?)(?=\n#{1,3}\s|$)/m);
  if (!m?.[1]) return null;
  return stripMarkdownInline(m[1].trim());
}

function proseFromMarkdown(md: string | null | undefined): string {
  if (!md) return 'No project context has been written yet.';
  const stripped = md
    .replace(/^#+\s+.*$/gm, '') // remove ATX headings
    .replace(/```[\s\S]*?```/g, '') // remove fenced code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link text only
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/^[-*+]\s+/gm, '') // list bullets
    .replace(/\n{2,}/g, ' · ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || 'No project context has been written yet.';
}

export default async function ProjectsPage() {
  const [allProjects, allBeliefs, allExperiments, narratives] = await Promise.all([
    db().select().from(projects).orderBy(desc(projects.updatedAt)),
    db().select({ projectId: beliefs.projectId, id: beliefs.id }).from(beliefs),
    db().select({ projectId: experiments.projectId, id: experiments.id, status: experiments.status }).from(experiments),
    db().select({ projectId: projectNarratives.projectId, id: projectNarratives.id, status: projectNarratives.status }).from(projectNarratives),
  ]);

  const beliefCount = new Map<string, number>();
  const experimentCount = new Map<string, number>();
  const activeExperimentCount = new Map<string, number>();
  const narrativeCount = new Map<string, number>();
  for (const belief of allBeliefs) {
    if (!belief.projectId) continue;
    beliefCount.set(belief.projectId, (beliefCount.get(belief.projectId) ?? 0) + 1);
  }
  for (const experiment of allExperiments) {
    if (!experiment.projectId) continue;
    experimentCount.set(experiment.projectId, (experimentCount.get(experiment.projectId) ?? 0) + 1);
    if (!['completed', 'shared', 'archived', 'cancelled'].includes(experiment.status)) {
      activeExperimentCount.set(experiment.projectId, (activeExperimentCount.get(experiment.projectId) ?? 0) + 1);
    }
  }
  for (const narrative of narratives) {
    narrativeCount.set(narrative.projectId, (narrativeCount.get(narrative.projectId) ?? 0) + 1);
  }

  const publicProjects = allProjects.filter((project) => project.public || project.shareToken).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Shareable research context, hypotheses, findings, open questions, and next experiments."
        meta={`${allProjects.length} total`}
      />

      <section className="grid gap-3 md:grid-cols-3">
        <MetricTile label="Shareable" value={publicProjects} icon={<Share2 className="h-4 w-4" aria-hidden="true" />} />
        <MetricTile label="Active experiments" value={Array.from(activeExperimentCount.values()).reduce((sum, value) => sum + value, 0)} tone="info" />
        <MetricTile label="Narratives" value={narratives.length} icon={<FileText className="h-4 w-4" aria-hidden="true" />} />
      </section>

      <NewProjectForm />

      {allProjects.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" aria-hidden="true" />}
          title="No projects yet"
          message="Create a project context before sharing ideas with mentors or collaborators."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {allProjects.map((project) => {
            const tagline = taglineFromMarkdown(project.summaryMd);
            const motivation = motivationFromMarkdown(project.summaryMd);
            const contribution = contributionFromMarkdown(project.summaryMd);
            const hasStructuredSections = Boolean(tagline || motivation || contribution);
            return (
            <Panel key={project.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={project.status} />
                    {project.public || project.shareToken ? <StatusBadge status="shared" /> : null}
                  </div>
                  <Link href={`/e/project/${project.id}`} className="mt-3 block text-base font-semibold tracking-tight hover:text-[--color-accent]">
                    {project.title}
                  </Link>
                  {tagline ? (
                    <p className="mt-1 text-sm italic leading-6 text-[--color-muted]">{tagline}</p>
                  ) : null}
                  {motivation ? (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[--color-muted]">Motivation</p>
                      <p className="mt-1 line-clamp-4 text-sm leading-6">{motivation}</p>
                    </div>
                  ) : null}
                  {contribution ? (
                    <div className="mt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[--color-muted]">What this project adds</p>
                      <p className="mt-1 line-clamp-4 text-sm leading-6">{contribution}</p>
                    </div>
                  ) : null}
                  {!hasStructuredSections ? (
                    <p className="mt-1 line-clamp-3 text-sm leading-6 text-[--color-muted]">
                      {proseFromMarkdown(project.summaryMd)}
                    </p>
                  ) : null}
                </div>
                <Link href={`/e/project/${project.id}`} className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
                  Open
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-[--color-surface-subtle] px-3 py-2">
                  <p className="font-mono text-sm">{beliefCount.get(project.id) ?? 0}</p>
                  <p className="text-[--color-muted]">beliefs</p>
                </div>
                <div className="rounded-md bg-[--color-surface-subtle] px-3 py-2">
                  <p className="font-mono text-sm">{experimentCount.get(project.id) ?? 0}</p>
                  <p className="text-[--color-muted]">experiments</p>
                </div>
                <div className="rounded-md bg-[--color-surface-subtle] px-3 py-2">
                  <p className="font-mono text-sm">{narrativeCount.get(project.id) ?? 0}</p>
                  <p className="text-[--color-muted]">context docs</p>
                </div>
              </div>
              {(activeExperimentCount.get(project.id) ?? 0) > 0 ? (
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-[--color-muted]">
                  <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
                  {activeExperimentCount.get(project.id)} active experiment
                  {(activeExperimentCount.get(project.id) ?? 0) === 1 ? '' : 's'}
                </p>
              ) : null}
            </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
