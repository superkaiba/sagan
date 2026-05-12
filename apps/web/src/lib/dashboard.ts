import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  agentRuns,
  approvalRequests,
  cleanResults,
  experiments,
  ideaCards,
  litItems,
  projects,
  todos,
  workflowEvents,
} from '@sagan/db/schema';
import { db } from './db';
import { experimentTurn } from './workflow';
import { statusTone, type StatusTone } from './status';

export type ApprovalAction =
  | { kind: 'experiment'; id: string; status: string }
  | { kind: 'clean_result'; id: string; status: string }
  | { kind: 'agent_run'; id: string; status: string };

export interface DashboardApprovalItem {
  key: string;
  group: 'decision' | 'blocked' | 'review';
  urgencyRank: number;
  title: string;
  context: string;
  requestedAction: string;
  kind: string;
  status: string;
  entityKind: string;
  entityId: string;
  href: string;
  createdAt: string;
  updatedAt: string;
  action?: ApprovalAction;
}

export interface DashboardShellState {
  approvalCount: number;
  activePipelineCount: number;
  literatureQueueCount: number;
  recentLogCount: number;
  topApprovals: DashboardApprovalItem[];
}

export interface DashboardPipelineCard {
  key: string;
  id: string;
  stage: PipelineStageKey;
  kind: 'experiment' | 'clean_result' | 'todo' | 'idea' | 'automation';
  title: string;
  detail: string | null;
  status: string;
  project: string | null;
  ownerAction: string | null;
  updatedAt: string;
  href: string;
  tone: StatusTone;
}

export const PIPELINE_STAGES = [
  { key: 'idea', title: 'Idea / Proposed' },
  { key: 'planning', title: 'Planning' },
  { key: 'approval', title: 'Awaiting approval' },
  { key: 'queued', title: 'Approved / Queued' },
  { key: 'running', title: 'Running' },
  { key: 'interpreting', title: 'Interpreting' },
  { key: 'review', title: 'Review' },
  { key: 'done', title: 'Shared / Done' },
  { key: 'blocked', title: 'Blocked' },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key'];

const ACTIVE_EXPERIMENT_STATUSES = [
  'proposed',
  'planning',
  'plan_pending',
  'approved',
  'awaiting_approval',
  'queued',
  'running',
  'verifying',
  'interpreting',
  'reviewing',
  'awaiting_promotion',
  'shared',
  'blocked',
  'completed',
  'failed',
] as const;

const ACTIVE_AGENT_STATUSES = ['queued', 'running', 'awaiting_approval', 'approved', 'deploying', 'blocked', 'failed'] as const;

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
}

function countOf(rows: Array<{ count: number }>) {
  return rows[0]?.count ?? 0;
}

export function entityHref(kind: string, id: string) {
  if (kind === 'clean_result') return `/clean-results/${id}`;
  if (kind === 'run') return `/agent/${id}`;
  return `/e/${kind}/${id}`;
}

export async function loadApprovalItems(limit = 200): Promise<DashboardApprovalItem[]> {
  const [requests, agentApprovalRuns, blockedExperiments, reviewResults] = await Promise.all([
    db()
      .select({
        id: approvalRequests.id,
        kind: approvalRequests.kind,
        title: approvalRequests.title,
        bodyMd: approvalRequests.bodyMd,
        status: approvalRequests.status,
        entityKind: approvalRequests.entityKind,
        entityId: approvalRequests.entityId,
        agentRunId: approvalRequests.agentRunId,
        requestedState: approvalRequests.requestedState,
        createdAt: approvalRequests.createdAt,
        updatedAt: approvalRequests.updatedAt,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, 'pending'))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(limit),
    db()
      .select({
        id: agentRuns.id,
        kind: agentRuns.kind,
        request: agentRuns.request,
        status: agentRuns.status,
        scopeEntityKind: agentRuns.scopeEntityKind,
        scopeEntityId: agentRuns.scopeEntityId,
        createdAt: agentRuns.createdAt,
        updatedAt: agentRuns.updatedAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.status, 'awaiting_approval'))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(limit),
    db()
      .select({
        id: experiments.id,
        title: experiments.title,
        hypothesis: sql<string>`left(coalesce(${experiments.hypothesis}, ''), 300)`,
        status: experiments.status,
        createdAt: experiments.createdAt,
        updatedAt: experiments.updatedAt,
      })
      .from(experiments)
      .where(eq(experiments.status, 'blocked'))
      .orderBy(desc(experiments.updatedAt))
      .limit(limit),
    db()
      .select({
        id: cleanResults.id,
        title: cleanResults.title,
        claim: sql<string>`left(coalesce(${cleanResults.claim}, ''), 300)`,
        status: cleanResults.status,
        artifactStatus: cleanResults.artifactStatus,
        createdAt: cleanResults.createdAt,
        updatedAt: cleanResults.updatedAt,
      })
      .from(cleanResults)
      .where(inArray(cleanResults.status, ['reviewing', 'blocked']))
      .orderBy(desc(cleanResults.updatedAt))
      .limit(limit),
  ]);

  const activeRunIds = new Set(agentApprovalRuns.map((run) => run.id));
  const activeExperimentApprovalIds = new Set(
    agentApprovalRuns
      .filter((run) => run.scopeEntityKind === 'experiment' && run.scopeEntityId)
      .map((run) => run.scopeEntityId!),
  );

  const requestItems: DashboardApprovalItem[] = requests
    .filter((request) => {
      if (request.agentRunId && activeRunIds.has(request.agentRunId)) return false;
      return !(request.kind === 'experiment_plan' && activeExperimentApprovalIds.has(request.entityId));
    })
    .map((request) => ({
      key: `approval-${request.id}`,
      group: 'decision',
      urgencyRank: 0,
      title: request.title,
      context: request.bodyMd ?? `${request.entityKind} ${request.entityId.slice(0, 8)}`,
      requestedAction: request.requestedState ? `Move to ${request.requestedState.replaceAll('_', ' ')}` : 'Review request',
      kind: request.kind,
      status: request.status,
      entityKind: request.entityKind,
      entityId: request.entityId,
      href: request.agentRunId ? `/agent/${request.agentRunId}` : entityHref(request.entityKind, request.entityId),
      createdAt: iso(request.createdAt),
      updatedAt: iso(request.updatedAt),
      action:
        request.agentRunId
          ? { kind: 'agent_run', id: request.agentRunId, status: request.status }
          : request.entityKind === 'experiment'
            ? { kind: 'experiment', id: request.entityId, status: request.requestedState ?? request.status }
            : request.entityKind === 'clean_result'
              ? { kind: 'clean_result', id: request.entityId, status: request.status }
              : undefined,
    }));

  const agentItems: DashboardApprovalItem[] = agentApprovalRuns.map((run) => ({
    key: `agent-${run.id}`,
    group: 'decision',
    urgencyRank: 0,
    title: run.request,
    context: run.scopeEntityKind && run.scopeEntityId ? `${run.scopeEntityKind} ${run.scopeEntityId.slice(0, 8)}` : 'automation run',
    requestedAction: 'Approve or reject the run plan',
    kind: run.kind,
    status: run.status,
    entityKind: run.scopeEntityKind ?? 'run',
    entityId: run.scopeEntityId ?? run.id,
    href: `/agent/${run.id}`,
    createdAt: iso(run.createdAt),
    updatedAt: iso(run.updatedAt),
    action: { kind: 'agent_run', id: run.id, status: run.status },
  }));

  const blockedItems: DashboardApprovalItem[] = blockedExperiments.map((experiment) => ({
    key: `blocked-experiment-${experiment.id}`,
    group: 'blocked',
    urgencyRank: 1,
    title: experiment.title,
    context: experiment.hypothesis || 'Experiment workflow is blocked.',
    requestedAction: 'Unblock, revise, or defer',
    kind: 'experiment',
    status: experiment.status,
    entityKind: 'experiment',
    entityId: experiment.id,
    href: entityHref('experiment', experiment.id),
    createdAt: iso(experiment.createdAt),
    updatedAt: iso(experiment.updatedAt),
    action: { kind: 'experiment', id: experiment.id, status: experiment.status },
  }));

  const cleanResultItems: DashboardApprovalItem[] = reviewResults.map((result) => ({
    key: `clean-result-${result.id}`,
    group: result.status === 'blocked' ? 'blocked' : 'review',
    urgencyRank: result.status === 'blocked' ? 1 : 2,
    title: result.title,
    context: result.claim || `Artifact status: ${result.artifactStatus}`,
    requestedAction: result.status === 'blocked' ? 'Resolve result blocker' : 'Review and approve when artifacts are verified',
    kind: 'clean_result',
    status: result.status,
    entityKind: 'clean_result',
    entityId: result.id,
    href: entityHref('clean_result', result.id),
    createdAt: iso(result.createdAt),
    updatedAt: iso(result.updatedAt),
    action: { kind: 'clean_result', id: result.id, status: result.status },
  }));

  return [...agentItems, ...requestItems, ...blockedItems, ...cleanResultItems].sort((a, b) => {
    const rank = a.urgencyRank - b.urgencyRank;
    if (rank !== 0) return rank;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export async function loadShellDashboardState(): Promise<DashboardShellState> {
  const [approvalItems, activeExperiments, activeCleanResults, activeTodos, activeAgents, literatureQueue, recentLog] =
    await Promise.all([
      loadApprovalItems(200),
      db()
        .select({ count: sql<number>`count(*)::int` })
        .from(experiments)
        .where(inArray(experiments.status, [...ACTIVE_EXPERIMENT_STATUSES])),
      db()
        .select({ count: sql<number>`count(*)::int` })
        .from(cleanResults)
        .where(inArray(cleanResults.status, ['draft', 'reviewing', 'blocked'])),
      db().select({ count: sql<number>`count(*)::int` }).from(todos).where(ne(todos.status, 'archived')),
      db()
        .select({ count: sql<number>`count(*)::int` })
        .from(agentRuns)
        .where(inArray(agentRuns.status, [...ACTIVE_AGENT_STATUSES])),
      db()
        .select({ count: sql<number>`count(*)::int` })
        .from(litItems)
        .where(inArray(litItems.readState, ['queued', 'reading', 'unread'])),
      db()
        .select({ count: sql<number>`count(*)::int` })
        .from(workflowEvents)
        .where(sql`${workflowEvents.createdAt} > now() - interval '7 days'`),
    ]);

  return {
    approvalCount: approvalItems.length,
    activePipelineCount:
      countOf(activeExperiments) + countOf(activeCleanResults) + countOf(activeTodos) + countOf(activeAgents),
    literatureQueueCount: countOf(literatureQueue),
    recentLogCount: countOf(recentLog),
    topApprovals: approvalItems.slice(0, 8),
  };
}

function experimentStage(status: string): PipelineStageKey {
  if (status === 'proposed') return 'idea';
  if (status === 'planning') return 'planning';
  if (status === 'plan_pending' || status === 'awaiting_approval') return 'approval';
  if (status === 'approved' || status === 'queued') return 'queued';
  if (status === 'running' || status === 'verifying') return 'running';
  if (status === 'interpreting') return 'interpreting';
  if (status === 'reviewing' || status === 'awaiting_promotion') return 'review';
  if (status === 'shared' || status === 'completed') return 'done';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'planning';
}

function cleanResultStage(status: string): PipelineStageKey {
  if (status === 'reviewing') return 'review';
  if (status === 'approved' || status === 'shared') return 'done';
  if (status === 'blocked') return 'blocked';
  return 'interpreting';
}

function todoStage(status: string): PipelineStageKey {
  if (status === 'inbox' || status === 'open') return 'idea';
  if (status === 'scoped') return 'planning';
  if (status === 'planning') return 'planning';
  if (status === 'running' || status === 'in_progress') return 'running';
  if (status === 'interpreting') return 'interpreting';
  if (status === 'awaiting_promotion') return 'review';
  if (status === 'done') return 'done';
  if (status === 'blocked' || status === 'cancelled') return 'blocked';
  return 'planning';
}

function agentStage(status: string): PipelineStageKey {
  if (status === 'awaiting_approval') return 'approval';
  if (status === 'queued' || status === 'approved') return 'queued';
  if (status === 'running' || status === 'deploying') return 'running';
  if (status === 'completed') return 'done';
  if (status === 'blocked' || status === 'failed' || status === 'rejected') return 'blocked';
  return 'queued';
}

export async function loadPipelineCards(): Promise<DashboardPipelineCard[]> {
  const [projectRows, experimentRows, cleanResultRows, todoRows, ideaRows, agentRows] = await Promise.all([
    db().select({ id: projects.id, title: projects.title }).from(projects).limit(500),
    db()
      .select({
        id: experiments.id,
        title: experiments.title,
        hypothesis: sql<string>`left(coalesce(${experiments.hypothesis}, ''), 220)`,
        status: experiments.status,
        projectId: experiments.projectId,
        updatedAt: experiments.updatedAt,
      })
      .from(experiments)
      .where(inArray(experiments.status, [...ACTIVE_EXPERIMENT_STATUSES]))
      .orderBy(desc(experiments.updatedAt))
      .limit(200),
    db()
      .select({
        id: cleanResults.id,
        title: cleanResults.title,
        claim: sql<string>`left(coalesce(${cleanResults.claim}, ''), 220)`,
        status: cleanResults.status,
        experimentId: cleanResults.experimentId,
        updatedAt: cleanResults.updatedAt,
      })
      .from(cleanResults)
      .where(ne(cleanResults.status, 'archived'))
      .orderBy(desc(cleanResults.updatedAt))
      .limit(200),
    db()
      .select({
        id: todos.id,
        text: todos.text,
        bodyMd: sql<string | null>`left(coalesce(${todos.bodyMd}, ''), 220)`,
        status: todos.status,
        priority: todos.priority,
        linkedKind: todos.linkedKind,
        linkedId: todos.linkedId,
        updatedAt: todos.updatedAt,
      })
      .from(todos)
      .where(ne(todos.status, 'archived'))
      .orderBy(desc(todos.updatedAt))
      .limit(200),
    db()
      .select({
        id: ideaCards.id,
        sessionId: ideaCards.sessionId,
        title: ideaCards.title,
        bodyMd: sql<string>`left(coalesce(${ideaCards.bodyMd}, ''), 220)`,
        state: ideaCards.state,
        promotedKind: ideaCards.promotedKind,
        promotedId: ideaCards.promotedId,
        updatedAt: ideaCards.updatedAt,
      })
      .from(ideaCards)
      .orderBy(desc(ideaCards.updatedAt))
      .limit(100),
    db()
      .select({
        id: agentRuns.id,
        kind: agentRuns.kind,
        request: sql<string>`left(coalesce(${agentRuns.request}, ''), 220)`,
        status: agentRuns.status,
        scopeEntityKind: agentRuns.scopeEntityKind,
        scopeEntityId: agentRuns.scopeEntityId,
        updatedAt: agentRuns.updatedAt,
      })
      .from(agentRuns)
      .where(inArray(agentRuns.status, [...ACTIVE_AGENT_STATUSES]))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(100),
  ]);

  const projectById = new Map(projectRows.map((project) => [project.id, project.title]));
  const experimentProjectById = new Map(experimentRows.map((experiment) => [experiment.id, experiment.projectId]));

  const cards: DashboardPipelineCard[] = [
    ...experimentRows.map((experiment) => ({
      key: `experiment-${experiment.id}`,
      id: experiment.id,
      stage: experimentStage(experiment.status),
      kind: 'experiment' as const,
      title: experiment.title,
      detail: experiment.hypothesis || null,
      status: experiment.status,
      project: experiment.projectId ? projectById.get(experiment.projectId) ?? null : null,
      ownerAction: ['plan_pending', 'awaiting_approval', 'blocked', 'awaiting_promotion'].includes(experiment.status)
        ? experimentTurn(experiment.status)
        : null,
      updatedAt: iso(experiment.updatedAt),
      href: entityHref('experiment', experiment.id),
      tone: statusTone(experiment.status),
    })),
    ...cleanResultRows.map((result) => {
      const projectId = result.experimentId ? experimentProjectById.get(result.experimentId) ?? null : null;
      return {
        key: `clean-result-${result.id}`,
        id: result.id,
        stage: cleanResultStage(result.status),
        kind: 'clean_result' as const,
        title: result.title,
        detail: result.claim || null,
        status: result.status,
        project: projectId ? projectById.get(projectId) ?? null : null,
        ownerAction: ['reviewing', 'blocked'].includes(result.status) ? 'Owner turn: review clean result' : null,
        updatedAt: iso(result.updatedAt),
        href: entityHref('clean_result', result.id),
        tone: statusTone(result.status),
      };
    }),
    ...todoRows.map((todo) => ({
      key: `todo-${todo.id}`,
      id: todo.id,
      stage: todoStage(todo.status),
      kind: 'todo' as const,
      title: todo.text,
      detail: todo.bodyMd || null,
      status: todo.status,
      project: null,
      ownerAction: todo.priority === 'urgent' || todo.status === 'blocked' ? `Owner turn: ${todo.priority} task` : null,
      updatedAt: iso(todo.updatedAt),
      href: todo.linkedKind && todo.linkedId ? entityHref(todo.linkedKind, todo.linkedId) : entityHref('todo', todo.id),
      tone: todo.priority === 'urgent' ? 'approval' : statusTone(todo.status),
    })),
    ...ideaRows.map((idea) => ({
      key: `idea-${idea.id}`,
      id: idea.id,
      stage: (idea.promotedKind && idea.promotedId ? 'done' : 'idea') as PipelineStageKey,
      kind: 'idea' as const,
      title: idea.title,
      detail: idea.bodyMd || null,
      status: idea.promotedKind ? 'promoted' : idea.state,
      project: null,
      ownerAction: idea.promotedKind ? null : 'Review or promote idea',
      updatedAt: iso(idea.updatedAt),
      href: idea.promotedKind && idea.promotedId ? entityHref(idea.promotedKind, idea.promotedId) : `/ideation/${idea.sessionId}`,
      tone: idea.promotedKind ? 'success' : statusTone(idea.state),
    })),
    ...agentRows.map((run) => ({
      key: `agent-${run.id}`,
      id: run.id,
      stage: agentStage(run.status),
      kind: 'automation' as const,
      title: run.request,
      detail: run.scopeEntityKind && run.scopeEntityId ? `${run.scopeEntityKind} ${run.scopeEntityId.slice(0, 8)}` : run.kind,
      status: run.status,
      project: null,
      ownerAction: run.status === 'awaiting_approval' ? 'Owner turn: approve automation run' : null,
      updatedAt: iso(run.updatedAt),
      href: `/agent/${run.id}`,
      tone: statusTone(run.status),
    })),
  ];

  return cards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
