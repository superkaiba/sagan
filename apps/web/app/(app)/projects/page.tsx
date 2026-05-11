import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { FileText, FolderOpen, FlaskConical, Share2 } from 'lucide-react';
import { beliefs, experiments, projectNarratives, projects } from '@sagan/db/schema';
import { EmptyState, MetricTile, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { NewProjectForm } from './NewProjectForm';

export const dynamic = 'force-dynamic';

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
        <div className="grid gap-3 lg:grid-cols-2">
          {allProjects.map((project) => (
            <Panel key={project.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={project.status} />
                    {project.public || project.shareToken ? <StatusBadge status="shared" /> : null}
                  </div>
                  <Link href={`/e/project/${project.id}`} className="mt-3 block text-base font-semibold tracking-tight hover:text-[--color-accent]">
                    {project.title}
                  </Link>
                  <p className="mt-1 line-clamp-3 text-sm leading-6 text-[--color-muted]">
                    {project.summaryMd ?? 'No project context has been written yet.'}
                  </p>
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
          ))}
        </div>
      )}
    </div>
  );
}
