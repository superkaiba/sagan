import { and, desc, eq } from 'drizzle-orm';
import { projectNarratives, projects } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { ProjectNarrativePanel } from './ProjectNarrativePanel';

export async function LoadProjectNarrative({ projectId }: { projectId: string }) {
  const [proj, published, drafts] = await Promise.all([
    db().select({ title: projects.title }).from(projects).where(eq(projects.id, projectId)).limit(1),
    db()
      .select()
      .from(projectNarratives)
      .where(and(eq(projectNarratives.projectId, projectId), eq(projectNarratives.status, 'published')))
      .orderBy(desc(projectNarratives.updatedAt))
      .limit(1),
    db()
      .select()
      .from(projectNarratives)
      .where(and(eq(projectNarratives.projectId, projectId), eq(projectNarratives.status, 'draft')))
      .orderBy(desc(projectNarratives.updatedAt))
      .limit(1),
  ]);
  if (proj.length === 0) return null;

  function format(row: typeof projectNarratives.$inferSelect | undefined) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      bodyMd: row.bodyMd,
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    };
  }

  return (
    <ProjectNarrativePanel
      projectId={projectId}
      projectTitle={proj[0]!.title}
      published={format(published[0])}
      latestDraft={format(drafts[0])}
    />
  );
}
