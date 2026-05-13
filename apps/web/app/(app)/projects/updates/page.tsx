import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { desc, isNull, ne } from 'drizzle-orm';
import { CalendarDays, FileText, FolderOpen, Newspaper, Sparkles } from 'lucide-react';
import { cleanResults, dailyLogEntries, experiments, projectNarratives, projects, weeklyDigests } from '@sagan/db/schema';
import { Markdown } from '@/components/Markdown';
import { ListRow, PageHeader, Panel, StatusBadge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { db } from '@/lib/db';
import { formatRelativeTime } from '@/lib/status';
import { GenerateProjectSummaryButton } from './GenerateProjectSummaryButton';

export const dynamic = 'force-dynamic';

type ProjectBucket = {
  project: typeof projects.$inferSelect;
  cleanResults: Array<typeof cleanResults.$inferSelect>;
  dailyEntries: Array<typeof dailyLogEntries.$inferSelect>;
  weeklyDigests: Array<typeof weeklyDigests.$inferSelect>;
  narratives: Array<typeof projectNarratives.$inferSelect>;
  lastActivity: number;
};

type ActivityItem = {
  key: string;
  kind: 'daily' | 'weekly' | 'clean_result' | 'summary';
  title: string;
  detail: string | null;
  href: string;
  at: Date | string;
  badge?: ReactNode;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function snippet(value: string | null | undefined, length = 220) {
  if (!value) return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function previewText(value: string | null | undefined, length = 220) {
  if (!value) return null;
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length)}...` : text || null;
}

function isImportedProjectPreview(narrative: typeof projectNarratives.$inferSelect) {
  return (
    narrative.title.toLowerCase() === 'github project import preview' ||
    narrative.bodyMd.includes('Imported preview of selected GitHub Project columns')
  );
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function latestDigestAt(digest: typeof weeklyDigests.$inferSelect) {
  return digest.sentAt ?? digest.editedAt ?? digest.draftedAt;
}

function touch(bucket: ProjectBucket, value: Date | string | null | undefined) {
  if (!value) return;
  const time = new Date(value).getTime();
  if (!Number.isNaN(time)) bucket.lastActivity = Math.max(bucket.lastActivity, time);
}

function bucketActivity(bucket: ProjectBucket): ActivityItem[] {
  return [
    ...bucket.dailyEntries.map((entry) => ({
      key: `daily-${entry.id}`,
      kind: 'daily' as const,
      title: `${entry.kind.replaceAll('_', ' ')} · ${entry.day}`,
      detail: snippet(entry.bodyMd),
      href: `/e/daily_log_entry/${entry.id}`,
      at: entry.createdAt,
      badge: <StatusBadge status={entry.kind} tone="info" />,
    })),
    ...bucket.weeklyDigests.map((digest) => ({
      key: `weekly-${digest.id}`,
      kind: 'weekly' as const,
      title: `Weekly digest · ${digest.weekStart}`,
      detail: snippet(digest.bodyMd),
      href: `/digests/${digest.id}`,
      at: latestDigestAt(digest),
      badge: <span className="text-xs text-[--color-muted]">weekly</span>,
    })),
    ...bucket.cleanResults.map((result) => ({
      key: `result-${result.id}`,
      kind: 'clean_result' as const,
      title: result.title,
      detail: snippet(result.claim),
      href: `/clean-results/${result.id}`,
      at: result.updatedAt,
      badge: <StatusBadge status={result.status} />,
    })),
    ...bucket.narratives.map((narrative) => ({
      key: `summary-${narrative.id}`,
      kind: 'summary' as const,
      title: narrative.title,
      detail: previewText(narrative.bodyMd),
      href: `/e/project_narrative/${narrative.id}`,
      at: narrative.updatedAt,
      badge: <StatusBadge status={narrative.status} />,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

const KIND_ICON = {
  daily: CalendarDays,
  weekly: Newspaper,
  clean_result: Sparkles,
  summary: FileText,
} satisfies Record<ActivityItem['kind'], ComponentType<{ className?: string; 'aria-hidden'?: boolean }>>;

export default async function ProjectUpdatesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const selectedParam = firstParam(params.project);

  const [projectRows, experimentRows, resultRows, entryRows, digestRows, narrativeRows] = await Promise.all([
    db().select().from(projects).orderBy(desc(projects.updatedAt)),
    db().select({ id: experiments.id, projectId: experiments.projectId }).from(experiments),
    db().select().from(cleanResults).where(ne(cleanResults.status, 'archived')).orderBy(desc(cleanResults.updatedAt)).limit(300),
    db()
      .select()
      .from(dailyLogEntries)
      .where(isNull(dailyLogEntries.archivedAt))
      .orderBy(desc(dailyLogEntries.createdAt))
      .limit(500),
    db().select().from(weeklyDigests).orderBy(desc(weeklyDigests.weekStart)).limit(200),
    db().select().from(projectNarratives).where(ne(projectNarratives.status, 'archived')).orderBy(desc(projectNarratives.updatedAt)).limit(200),
  ]);

  const buckets = new Map<string, ProjectBucket>();
  for (const project of projectRows) {
    buckets.set(project.id, {
      project,
      cleanResults: [],
      dailyEntries: [],
      weeklyDigests: [],
      narratives: [],
      lastActivity: new Date(project.updatedAt).getTime(),
    });
  }

  const projectByExperiment = new Map(experimentRows.map((experiment) => [experiment.id, experiment.projectId]));
  const projectByCleanResult = new Map<string, string | null>();

  for (const result of resultRows) {
    const projectId = result.experimentId ? projectByExperiment.get(result.experimentId) ?? null : null;
    projectByCleanResult.set(result.id, projectId);
    if (!projectId) continue;
    const bucket = buckets.get(projectId);
    if (!bucket) continue;
    bucket.cleanResults.push(result);
    touch(bucket, result.updatedAt);
  }

  for (const entry of entryRows) {
    const projectId =
      entry.entityKind === 'project'
        ? entry.entityId
        : entry.entityKind === 'experiment' && entry.entityId
          ? projectByExperiment.get(entry.entityId) ?? null
          : entry.entityKind === 'clean_result' && entry.entityId
            ? projectByCleanResult.get(entry.entityId) ?? null
            : null;
    if (!projectId) continue;
    const bucket = buckets.get(projectId);
    if (!bucket) continue;
    bucket.dailyEntries.push(entry);
    touch(bucket, entry.createdAt);
  }

  for (const digest of digestRows) {
    const bucket = buckets.get(digest.projectId);
    if (!bucket) continue;
    bucket.weeklyDigests.push(digest);
    touch(bucket, latestDigestAt(digest));
  }

  const narrativeProjectById = new Map<string, string>();
  for (const narrative of narrativeRows.filter((row) => !isImportedProjectPreview(row))) {
    const bucket = buckets.get(narrative.projectId);
    if (!bucket) continue;
    narrativeProjectById.set(narrative.id, narrative.projectId);
    bucket.narratives.push(narrative);
    touch(bucket, narrative.updatedAt);
  }

  for (const entry of entryRows) {
    const projectId = entry.entityKind === 'project_narrative' && entry.entityId ? narrativeProjectById.get(entry.entityId) ?? null : null;
    if (!projectId) continue;
    const bucket = buckets.get(projectId);
    if (!bucket) continue;
    bucket.dailyEntries.push(entry);
    touch(bucket, entry.createdAt);
  }

  const ordered = Array.from(buckets.values()).sort((a, b) => b.lastActivity - a.lastActivity);
  const selected = (selectedParam ? buckets.get(selectedParam) : null) ?? ordered[0] ?? null;
  const selectedActivity = selected ? bucketActivity(selected) : [];
  const latestNarrative = selected?.narratives[0] ?? null;

  return (
    <div className="space-y-6">
      {ordered.length > 0 ? (
        <Panel className="overflow-hidden">
          <div className="flex min-h-11 items-center gap-2 border-b border-[--color-border] px-3 text-sm font-semibold">
            <FolderOpen className="h-4 w-4 text-[--color-muted]" aria-hidden="true" />
            Switch project
          </div>
          <div className="flex gap-2 overflow-x-auto p-2">
            {ordered.map((bucket) => {
              const active = selected?.project.id === bucket.project.id;
              const count = bucket.cleanResults.length + bucket.dailyEntries.length + bucket.weeklyDigests.length + bucket.narratives.length;
              return (
                <Link
                  key={bucket.project.id}
                  href={`/projects/updates?project=${bucket.project.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'min-w-[13rem] border px-3 py-2 text-left shadow-[var(--shadow-inset)]',
                    active
                      ? 'border-[--color-accent] bg-[--color-panel] text-[--color-fg]'
                      : 'border-[--color-border] bg-[--color-bg] text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]',
                  )}
                >
                  <p className="truncate text-sm font-semibold">{bucket.project.title}</p>
                  <p className="mt-1 text-xs">
                    {count} log items · updated {formatRelativeTime(bucket.project.updatedAt)}
                  </p>
                </Link>
              );
            })}
          </div>
        </Panel>
      ) : null}

      <PageHeader
        title="Project Log"
        description="One project at a time: current project summary, summary docs, clean results, daily notes, and weekly digests."
        meta={selected ? `${ordered.length} projects` : 'No projects'}
        actions={selected ? <GenerateProjectSummaryButton projectId={selected.project.id} /> : null}
      />

      {selected ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
            <Panel className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[--color-border] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={selected.project.status} />
                    <h2 className="text-base font-semibold tracking-tight">{selected.project.title}</h2>
                  </div>
                  <p className="mt-1 text-xs text-[--color-muted]">Project updated {formatDate(selected.project.updatedAt)}</p>
                </div>
                <div className="grid grid-cols-4 gap-3 text-right text-xs text-[--color-muted]">
                  <span>{selected.dailyEntries.length} daily</span>
                  <span>{selected.weeklyDigests.length} weekly</span>
                  <span>{selected.cleanResults.length} results</span>
                  <span>{selected.narratives.length} docs</span>
                </div>
              </div>
              <div className="p-4">
                {selected.project.summaryMd ? (
                  <Markdown className="text-[--color-fg]">{selected.project.summaryMd}</Markdown>
                ) : (
                  <p className="text-sm text-[--color-muted]">No current project summary has been written yet.</p>
                )}
              </div>
            </Panel>

            <Panel className="overflow-hidden">
              <div className="flex min-h-11 items-center gap-2 border-b border-[--color-border] px-4 text-sm font-semibold">
                <FileText className="h-4 w-4 text-[--color-muted]" aria-hidden="true" />
                Latest summary doc
              </div>
              {latestNarrative ? (
                <ListRow
                  href={`/e/project_narrative/${latestNarrative.id}`}
                  title={latestNarrative.title}
                  detail={previewText(latestNarrative.bodyMd, 320)}
                  meta={<StatusBadge status={latestNarrative.status} />}
                />
              ) : (
                <p className="px-4 py-4 text-sm text-[--color-muted]">No summary docs for this project yet.</p>
              )}
            </Panel>
          </section>

          <Panel className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">Summary Log</h2>
              <div className="flex flex-wrap gap-3 text-xs text-[--color-muted]">
                <span>{selected.weeklyDigests.length} weekly</span>
                <span>{selected.dailyEntries.length} daily</span>
                <span>{selected.cleanResults.length} clean results</span>
                <span>{selected.narratives.length} summaries</span>
              </div>
            </div>
            <div className="divide-y divide-[--color-border]">
              {selectedActivity.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[--color-muted]">No updates have been linked to this project yet.</p>
              ) : (
                selectedActivity.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <Link key={item.key} href={item.href} className="grid gap-3 px-4 py-3 hover:bg-[--color-hover] md:grid-cols-[8rem_minmax(0,1fr)]">
                      <div className="flex items-start gap-2 text-xs text-[--color-muted]">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <div>
                          <p className="font-medium text-[--color-fg]">{formatDate(item.at)}</p>
                          <p>{formatRelativeTime(item.at)}</p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="min-w-0 truncate text-sm font-semibold">{item.title}</h3>
                          {item.badge}
                        </div>
                        {item.detail ? <p className="mt-1 line-clamp-2 text-sm leading-5 text-[--color-muted]">{item.detail}</p> : null}
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </Panel>
        </>
      ) : (
        <Panel className="p-6 text-center text-sm text-[--color-muted]">
          <FolderOpen className="mx-auto mb-2 h-5 w-5" aria-hidden="true" />
          No projects yet.
        </Panel>
      )}
    </div>
  );
}
