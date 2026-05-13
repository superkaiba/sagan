import { notFound } from 'next/navigation';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { agentRuns, podLifecycle, projectNarratives, projects } from '@sagan/db/schema';
import { isEntityKind, KIND_LABELS, loadEntity } from '@/lib/entity';
import { ClarifyingQuestionsPanel } from '@/components/ClarifyingQuestionsPanel';
import { Comments } from '@/components/Comments';
import { PlanPanel } from '@/components/PlanPanel';
import { PlanHistory } from '@/components/PlanHistory';
import { ProposedFollowUps } from '@/components/ProposedFollowUps';
import { ExperimentReviewPanel } from '@/components/ExperimentReviewPanel';
import { EditableBody } from '@/components/EditableBody';
import { CommentableBody } from '@/components/CommentableBody';
import { EditableTitle } from '@/components/EditableTitle';
import { EntityEdges } from '@/components/EntityEdges';
import { BeliefHistoryLink } from '@/components/BeliefHistoryLink';
import { ProjectChildren } from '@/components/ProjectChildren';
import { LoadProjectNarrative } from '@/components/LoadProjectNarrative';
import { LiteratureIntelligencePanel } from '@/components/LiteratureIntelligencePanel';
import { AskClaudeAboutPaper } from '@/components/AskClaudeAboutPaper';
import {
  LiteraturePaperMain,
  LiteraturePaperSide,
  type LitPaperFields,
} from '@/components/LiteraturePaperView';
import { StartIdeationButton } from '@/components/StartIdeationButton';
import { AgentActivityPanel } from '@/components/AgentActivityPanel';
import { NarrativePublishControl } from '@/components/NarrativePublishControl';
import { ForbiddenError, isOwner, requireEntityRead } from '@/lib/access';
import { requireSession } from '@/lib/auth';
import { isIdeationSourceKind } from '@/lib/ideation';
import { AnchoredCommentsProvider } from '@/components/AnchoredCommentsContext';
import { ProcessStateBadge } from '@/components/ProcessStateBadge';
import { db } from '@/lib/db';
import { deriveProcessState } from '@/lib/process-state';

export const dynamic = 'force-dynamic';

type EditableTitleKind =
  | 'project'
  | 'belief'
  | 'todo'
  | 'lit_item'
  | 'project_narrative'
  | 'experiment';

type EditableBodyKind = EditableTitleKind | 'run' | 'daily_log_entry';
const ACTIVE_POD_STATUSES = ['queued', 'deploying', 'running', 'retrying', 'stop_requested', 'blocked'] as const;

function canEditTitle(kind: string): kind is EditableTitleKind {
  return ['project', 'belief', 'todo', 'lit_item', 'project_narrative', 'experiment'].includes(kind);
}

function canEditBody(kind: string): kind is EditableBodyKind {
  return [...['project', 'belief', 'todo', 'lit_item', 'project_narrative', 'experiment'], 'run', 'daily_log_entry'].includes(kind);
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isEntityKind(kind)) return notFound();
  const session = await requireSession();
  try {
    await requireEntityRead(session, kind, id);
  } catch (err) {
    if (err instanceof ForbiddenError) return notFound();
    throw err;
  }
  const entity = await loadEntity(kind, id);
  if (!entity) return notFound();
  const owner = isOwner(session);
  const processRunRows = await db()
    .select({
      id: agentRuns.id,
      kind: agentRuns.kind,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(and(eq(agentRuns.scopeEntityKind, kind), eq(agentRuns.scopeEntityId, entity.id)))
    .orderBy(desc(agentRuns.updatedAt))
    .limit(1);
  const processRun = processRunRows[0] ?? null;
  const processPods =
    kind === 'experiment'
      ? await db()
          .select({ status: podLifecycle.status })
          .from(podLifecycle)
          .where(and(eq(podLifecycle.experimentId, entity.id), inArray(podLifecycle.status, [...ACTIVE_POD_STATUSES])))
      : processRun
        ? await db()
            .select({ status: podLifecycle.status })
            .from(podLifecycle)
            .where(and(eq(podLifecycle.agentRunId, processRun.id), inArray(podLifecycle.status, [...ACTIVE_POD_STATUSES])))
        : [];
  const processState = deriveProcessState({
    entityKind: kind,
    status: entity.status,
    run: processRun,
    pods: processPods,
  });

  // For experiments, show "#<number>" alongside the title for at-a-glance
  // identification. The number lives in entity.meta (loaded by lib/entity.ts).
  const numberMeta = entity.meta?.find((m) => m.label === '#');
  const titlePrefix = kind === 'experiment' && numberMeta ? `#${numberMeta.value}` : null;

  // For project_narratives, fetch the parent project's slug + public flag so
  // the publish control can offer a "View public page" link after publishing.
  let narrativeProject: { slug: string; isPublic: boolean } | null = null;
  if (kind === 'project_narrative') {
    const rows = await db()
      .select({ slug: projects.slug, isPublic: projects.public })
      .from(projectNarratives)
      .innerJoin(projects, eq(projects.id, projectNarratives.projectId))
      .where(eq(projectNarratives.id, entity.id))
      .limit(1);
    if (rows[0]) narrativeProject = { slug: rows[0].slug, isPublic: rows[0].isPublic };
  }


  return (
    <AnchoredCommentsProvider>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <main className="min-w-0 space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-sm text-[--color-muted]">
            {KIND_LABELS[kind]}
            {titlePrefix ? <span className="ml-2 font-mono">{titlePrefix}</span> : null}
          </p>
          {kind === 'run' ? (
            <h1 className="text-2xl font-semibold tracking-tight">{entity.title}</h1>
          ) : owner && canEditTitle(kind) ? (
            <EditableTitle kind={kind} id={entity.id} initialTitle={entity.title} />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{entity.title}</h1>
          )}
          <p className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <ProcessStateBadge state={processState} />
            {owner && kind === 'project_narrative' && entity.status ? (
              <NarrativePublishControl
                narrativeId={entity.id}
                status={entity.status as 'draft' | 'published' | 'archived'}
                projectSlug={narrativeProject?.slug ?? null}
                projectIsPublic={narrativeProject?.isPublic ?? false}
              />
            ) : null}
          </p>
          {owner && isIdeationSourceKind(kind) ? (
            <StartIdeationButton sourceKind={kind} sourceId={entity.id} />
          ) : null}
        </header>

        {kind === 'experiment' ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
              Clarifications
            </h2>
            <ClarifyingQuestionsPanel
              experimentId={entity.id}
              status={entity.status}
              planJson={(entity.raw as { planJson?: unknown }).planJson}
              canDispatch={owner}
            />
          </section>
        ) : null}

        {(kind === 'experiment' || kind === 'todo') ? (
          <PlanPanel entityKind={kind} entityId={entity.id} experimentStatus={entity.status} />
        ) : null}

        {kind === 'experiment' ? (
          <PlanHistory experimentId={entity.id} />
        ) : null}

        {kind === 'lit_item' ? (
          <LiteraturePaperMain paper={entity.raw as unknown as LitPaperFields} />
        ) : owner && canEditBody(kind) ? (
          <EditableBody kind={kind} id={entity.id} initialBody={entity.body ?? ''} />
        ) : (
          <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
            <CommentableBody body={entity.body ?? ''} />
          </section>
        )}

        {owner && kind === 'experiment' && (entity.status === 'reviewing' || entity.status === 'followups_running') ? (
          <ExperimentReviewPanel
            experimentId={entity.id}
            status={entity.status as 'reviewing' | 'followups_running'}
          />
        ) : null}

        {kind === 'belief' ? <BeliefHistoryLink beliefId={entity.id} /> : null}
        {kind === 'project' ? (
          <>
            <LoadProjectNarrative projectId={entity.id} />
            <ProjectChildren projectId={entity.id} />
          </>
        ) : null}

      </main>

      <aside className="min-w-0 space-y-4 xl:border-l xl:border-[--color-border] xl:pl-5">
        {kind === 'lit_item' ? (
          <LiteraturePaperSide paper={entity.raw as unknown as LitPaperFields} />
        ) : null}
        <AgentActivityPanel
          entityKind={kind}
          entityId={entity.id}
          canManageRun={owner}
          showWhenEmpty={kind === 'experiment' || kind === 'todo'}
        />

        {/* ProposedFollowUps (sidebar "Move to todo") is superseded by
            ExperimentReviewPanel in the main column for experiments in
            `reviewing`/`followups_running`. Keep it around only outside those
            states so legacy kind='todo' comments stay actionable. */}
        {kind === 'experiment' && entity.status !== 'reviewing' && entity.status !== 'followups_running' ? (
          <ProposedFollowUps experimentId={entity.id} />
        ) : null}

        {kind === 'lit_item' ? (
          <AskClaudeAboutPaper litItemId={entity.id} paperTitle={entity.title} />
        ) : null}

        <Comments entityKind={kind} entityId={entity.id} />

        {entity.meta && entity.meta.length > 0 && kind !== 'lit_item' ? (
          <details className="rounded-lg border border-[--color-border] bg-[--color-panel]">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-[--color-muted]">Details</summary>
            <dl className="border-t border-[--color-border]">
              {entity.meta.map((m) => (
                <div key={m.label} className="grid grid-cols-[6rem_1fr] gap-3 border-b border-[--color-border] px-4 py-2 text-sm last:border-b-0">
                  <dt className="text-[--color-muted]">{m.label}</dt>
                  <dd className="min-w-0 break-all font-mono text-xs">{m.value}</dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}

        <EntityEdges entityKind={kind} entityId={entity.id} />
      </aside>
      </div>
    </AnchoredCommentsProvider>
  );
}
