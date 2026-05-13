import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import {
  agentRuns,
  approvalRequests,
  cleanResults,
  experiments,
  ideaCards,
  litItems,
  podLifecycle,
  projects,
  todos,
  workflowEvents,
} from '@sagan/db/schema';
import { db } from './db';
import { experimentTurn } from './workflow';
import { statusTone, type StatusTone } from './status';
import { deriveProcessState, type ProcessState } from './process-state';
import { loadRunPodAccountSummaries, type RunPodAccountSummary } from './runpod-api';
import { getExperimentEstimate } from './experiment-estimate';

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

export type DashboardApprovalBucketKey = 'plan' | 'promotion' | 'blocked';

export interface DashboardApprovalBucketSummary {
  key: DashboardApprovalBucketKey;
  count: number;
  items: DashboardApprovalItem[];
}

export interface DashboardShellState {
  approvalCount: number;
  activePipelineCount: number;
  literatureQueueCount: number;
  recentLogCount: number;
  activePods: DashboardRunPod[];
  runpodAccounts: RunPodAccountSummary[];
  topApprovals: DashboardApprovalItem[];
  approvalBuckets: DashboardApprovalBucketSummary[];
}

export type PipelineRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'approved'
  | 'deploying'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rejected';

export interface PipelineCardRun {
  id: string;
  kind: string;
  status: PipelineRunStatus;
  updatedAt: string;
  lastError: string | null;
  href: string;
  canRetry: boolean;
}

export interface PipelineCardPod {
  id: string;
  podId: string;
  status: string;
  desiredStatus: string | null;
  gpuTypeId: string | null;
  gpuCount: number | null;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
  lastCheckedAt: string | null;
  lastStartedAt: string | null;
  createdAt: string;
  updatedAt: string;
  href: string;
}

export interface DashboardPipelineCard {
  key: string;
  id: string;
  stage: PipelineStageKey;
  kind: 'experiment' | 'clean_result' | 'todo' | 'idea' | 'automation';
  marker?: string | null;
  title: string;
  detail: string | null;
  status: string;
  project: string | null;
  ownerAction: string | null;
  processState: ProcessState;
  createdAt: string;
  updatedAt: string;
  href: string;
  tone: StatusTone;
  run?: PipelineCardRun | null;
  pods?: PipelineCardPod[];
  estimatedRemainingMinutes?: number | null;
  estimatedRemainingUpdatedAt?: string | null;
  estimatedRemainingSource?: string | null;
  estimatedRemainingMessage?: string | null;
  progressPct?: number | null;
}

export interface DashboardRunPod {
  id: string;
  podId: string;
  account: string;
  name: string | null;
  status: string;
  desiredStatus: string | null;
  gpuTypeId: string | null;
  gpuCount: number | null;
  costPerHr: number | null;
  adjustedCostPerHr: number | null;
  uptimeSeconds: number | null;
  agentRunId: string | null;
  experimentId: string | null;
  experimentMarker: string | null;
  experimentTitle: string | null;
  experimentEstimatedRemainingMinutes: number | null;
  experimentEstimatedRemainingUpdatedAt: string | null;
  experimentEstimatedRemainingSource: string | null;
  experimentEstimatedRemainingMessage: string | null;
  experimentProgressPct: number | null;
  updatedAt: string;
  lastCheckedAt: string | null;
  lastStartedAt: string | null;
  createdAt: string;
  href: string;
}

export const PIPELINE_STAGES = [
  { key: 'later', title: 'Later' },
  { key: 'idea', title: 'Idea / Proposed' },
  { key: 'planning', title: 'Planning' },
  { key: 'approval', title: 'Awaiting approval' },
  { key: 'queued', title: 'Approved / Queued' },
  { key: 'running', title: 'Running' },
  { key: 'interpreting', title: 'Interpreting' },
  { key: 'clean_results', title: 'Clean results' },
  { key: 'blocked', title: 'Blocked' },
  { key: 'review', title: 'Review' },
  { key: 'done', title: 'Shared / Done' },
  { key: 'archived', title: 'Archived' },
] as const;

export type PipelineStageKey = (typeof PIPELINE_STAGES)[number]['key'];
const PIPELINE_STAGE_KEYS = new Set<PipelineStageKey>(PIPELINE_STAGES.map((stage) => stage.key));
const PIPELINE_STAGE_NOTE_PREFIX = 'sagan:pipeline-stage=';

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
  'archived',
] as const;

const ACTIVE_AGENT_STATUSES = ['queued', 'running', 'awaiting_approval', 'approved', 'deploying', 'blocked', 'failed', 'cancelled'] as const;
const ACTIVE_POD_STATUSES = ['queued', 'deploying', 'running', 'retrying', 'stop_requested', 'blocked'] as const;
const DEPRIORITIZED_TODO_STATUSES = ['inbox', 'open', 'scoped', 'planning'] as const;
const DEPRIORITIZED_EXPERIMENT_STATUSES = ['proposed', 'planning'] as const;

function iso(value: Date | string | null | undefined) {
  if (!value) return new Date(0).toISOString();
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
}

function experimentMarker(number: number | null | undefined) {
  return typeof number === 'number' ? `#${number}` : null;
}

function countOf(rows: Array<{ count: number }>) {
  return rows[0]?.count ?? 0;
}

export function entityHref(kind: string, id: string) {
  if (kind === 'clean_result') return `/clean-results/${id}`;
  if (kind === 'run') return `/agent/${id}`;
  return `/e/${kind}/${id}`;
}

export async function loadActiveRunPods(limit = 20): Promise<DashboardRunPod[]> {
  const podRows = await db()
    .select({
      id: podLifecycle.id,
      podId: podLifecycle.runpodPodId,
      account: podLifecycle.account,
      name: podLifecycle.name,
      status: podLifecycle.status,
      desiredStatus: podLifecycle.desiredStatus,
      gpuTypeId: podLifecycle.gpuTypeId,
      gpuCount: podLifecycle.gpuCount,
      costPerHr: podLifecycle.costPerHr,
      adjustedCostPerHr: podLifecycle.adjustedCostPerHr,
      uptimeSeconds: podLifecycle.uptimeSeconds,
      agentRunId: podLifecycle.agentRunId,
      experimentId: podLifecycle.experimentId,
      createdAt: podLifecycle.createdAt,
      updatedAt: podLifecycle.updatedAt,
      lastCheckedAt: podLifecycle.lastCheckedAt,
      lastStartedAt: podLifecycle.lastStartedAt,
    })
    .from(podLifecycle)
    .where(inArray(podLifecycle.status, [...ACTIVE_POD_STATUSES]))
    .orderBy(desc(podLifecycle.updatedAt))
    .limit(limit);

  const experimentIds = Array.from(new Set(podRows.map((pod) => pod.experimentId).filter((id): id is string => Boolean(id))));
  const experimentRows =
    experimentIds.length > 0
      ? await db()
          .select({ id: experiments.id, number: experiments.number, title: experiments.title, planJson: experiments.planJson })
          .from(experiments)
          .where(inArray(experiments.id, experimentIds))
      : [];
  const experimentById = new Map(experimentRows.map((experiment) => [experiment.id, experiment]));

  return podRows.map((pod) => {
    const experiment = pod.experimentId ? experimentById.get(pod.experimentId) : null;
    const estimate = getExperimentEstimate(experiment?.planJson);
    return {
      id: pod.id,
      podId: pod.podId,
      account: pod.account,
      name: pod.name,
      status: pod.status,
      desiredStatus: pod.desiredStatus,
      gpuTypeId: pod.gpuTypeId,
      gpuCount: pod.gpuCount,
      costPerHr: pod.costPerHr,
      adjustedCostPerHr: pod.adjustedCostPerHr,
      uptimeSeconds: pod.uptimeSeconds,
      agentRunId: pod.agentRunId,
      experimentId: pod.experimentId,
      experimentMarker: experimentMarker(experiment?.number),
      experimentTitle: experiment?.title ?? null,
      experimentEstimatedRemainingMinutes: estimate.remainingMinutes,
      experimentEstimatedRemainingUpdatedAt: estimate.updatedAt,
      experimentEstimatedRemainingSource: estimate.source,
      experimentEstimatedRemainingMessage: estimate.message,
      experimentProgressPct: estimate.progressPct,
      createdAt: iso(pod.createdAt),
      updatedAt: iso(pod.updatedAt),
      lastCheckedAt: pod.lastCheckedAt ? iso(pod.lastCheckedAt) : null,
      lastStartedAt: pod.lastStartedAt ? iso(pod.lastStartedAt) : null,
      href: pod.agentRunId ? `/agent/${pod.agentRunId}` : pod.experimentId ? entityHref('experiment', pod.experimentId) : '/admin/health',
    };
  });
}

export async function loadApprovalItems(limit = 200): Promise<DashboardApprovalItem[]> {
  const [requests, agentApprovalRuns, blockedExperiments, promotionExperiments, reviewResults, promotionTodos, blockedTodos] = await Promise.all([
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
        id: experiments.id,
        title: experiments.title,
        hypothesis: sql<string>`left(coalesce(${experiments.hypothesis}, ''), 300)`,
        status: experiments.status,
        createdAt: experiments.createdAt,
        updatedAt: experiments.updatedAt,
      })
      .from(experiments)
      .where(eq(experiments.status, 'awaiting_promotion'))
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
    db()
      .select({
        id: todos.id,
        text: todos.text,
        bodyMd: sql<string>`left(coalesce(${todos.bodyMd}, ''), 300)`,
        status: todos.status,
        createdAt: todos.createdAt,
        updatedAt: todos.updatedAt,
      })
      .from(todos)
      .where(eq(todos.status, 'awaiting_promotion'))
      .orderBy(desc(todos.updatedAt))
      .limit(limit),
    db()
      .select({
        id: todos.id,
        text: todos.text,
        bodyMd: sql<string>`left(coalesce(${todos.bodyMd}, ''), 300)`,
        status: todos.status,
        createdAt: todos.createdAt,
        updatedAt: todos.updatedAt,
      })
      .from(todos)
      .where(eq(todos.status, 'blocked'))
      .orderBy(desc(todos.updatedAt))
      .limit(limit),
  ]);

  const activeRunIds = new Set(agentApprovalRuns.map((run) => run.id));
  const activeExperimentApprovalIds = new Set(
    agentApprovalRuns
      .filter((run) => run.scopeEntityKind === 'experiment' && run.scopeEntityId)
      .map((run) => run.scopeEntityId!),
  );
  const pendingPromotionExperimentIds = new Set(
    requests
      .filter((request) => request.kind === 'clean_result_promotion' && request.entityKind === 'experiment')
      .map((request) => request.entityId),
  );
  const pendingPromotionCleanResultIds = new Set(
    requests
      .filter((request) => request.kind === 'clean_result_promotion' && request.entityKind === 'clean_result')
      .map((request) => request.entityId),
  );
  const scopedExperimentIds = Array.from(
    new Set(
      agentApprovalRuns
        .filter((run) => run.scopeEntityKind === 'experiment' && run.scopeEntityId)
        .map((run) => run.scopeEntityId!),
    ),
  );
  const scopedCleanResultIds = Array.from(
    new Set(
      agentApprovalRuns
        .filter((run) => run.scopeEntityKind === 'clean_result' && run.scopeEntityId)
        .map((run) => run.scopeEntityId!),
    ),
  );
  const scopedTodoIds = Array.from(
    new Set(
      agentApprovalRuns
        .filter((run) => run.scopeEntityKind === 'todo' && run.scopeEntityId)
        .map((run) => run.scopeEntityId!),
    ),
  );
  const [scopedExperiments, scopedCleanResults, scopedTodos] = await Promise.all([
    scopedExperimentIds.length > 0
      ? db()
          .select({ id: experiments.id, number: experiments.number, title: experiments.title })
          .from(experiments)
          .where(inArray(experiments.id, scopedExperimentIds))
      : [],
    scopedCleanResultIds.length > 0
      ? db()
          .select({ id: cleanResults.id, title: cleanResults.title })
          .from(cleanResults)
          .where(inArray(cleanResults.id, scopedCleanResultIds))
      : [],
    scopedTodoIds.length > 0
      ? db()
          .select({ id: todos.id, text: todos.text })
          .from(todos)
          .where(inArray(todos.id, scopedTodoIds))
      : [],
  ]);
  const scopedExperimentById = new Map(scopedExperiments.map((experiment) => [experiment.id, experiment]));
  const scopedCleanResultTitleById = new Map(scopedCleanResults.map((result) => [result.id, result.title]));
  const scopedTodoTitleById = new Map(scopedTodos.map((todo) => [todo.id, todo.text]));

  function scopedApprovalTitle(run: (typeof agentApprovalRuns)[number]) {
    if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) {
      const experiment = scopedExperimentById.get(run.scopeEntityId);
      if (experiment) {
        const marker = experimentMarker(experiment.number);
        return marker ? `${marker} ${experiment.title}` : experiment.title;
      }
    }
    if (run.scopeEntityKind === 'clean_result' && run.scopeEntityId) {
      const title = scopedCleanResultTitleById.get(run.scopeEntityId);
      if (title) return title;
    }
    if (run.scopeEntityKind === 'todo' && run.scopeEntityId) {
      const title = scopedTodoTitleById.get(run.scopeEntityId);
      if (title) return title;
    }
    return run.request;
  }

  function scopedApprovalContext(run: (typeof agentApprovalRuns)[number]) {
    if (!run.scopeEntityKind || !run.scopeEntityId) return 'automation run';
    return run.request;
  }

  const requestItems: DashboardApprovalItem[] = requests
    .filter((request) => {
      if (request.agentRunId && activeRunIds.has(request.agentRunId)) return false;
      return !(request.kind === 'experiment_plan' && activeExperimentApprovalIds.has(request.entityId));
    })
    .map((request) => ({
      key: `approval-${request.id}`,
      group: request.kind === 'clean_result_promotion' ? 'review' : 'decision',
      urgencyRank: request.kind === 'clean_result_promotion' ? 2 : 0,
      title: request.title,
      context: request.bodyMd ?? `${request.entityKind} ${request.entityId.slice(0, 8)}`,
      requestedAction:
        request.kind === 'clean_result_promotion'
          ? 'Approve promotion or send back'
          : request.requestedState
            ? `Move to ${request.requestedState.replaceAll('_', ' ')}`
            : 'Review request',
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
    title: scopedApprovalTitle(run),
    context: scopedApprovalContext(run),
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

  const promotionExperimentItems: DashboardApprovalItem[] = promotionExperiments
    .filter((experiment) => !pendingPromotionExperimentIds.has(experiment.id))
    .map((experiment) => ({
      key: `promotion-experiment-${experiment.id}`,
      group: 'review',
      urgencyRank: 2,
      title: experiment.title,
      context: experiment.hypothesis || 'Clean result is waiting for owner promotion approval.',
      requestedAction: 'Approve promotion or send back',
      kind: 'experiment',
      status: experiment.status,
      entityKind: 'experiment',
      entityId: experiment.id,
      href: entityHref('experiment', experiment.id),
      createdAt: iso(experiment.createdAt),
      updatedAt: iso(experiment.updatedAt),
    }));

  const cleanResultItems: DashboardApprovalItem[] = reviewResults.map((result) => ({
    key: `clean-result-${result.id}`,
    group: result.status === 'blocked' ? ('blocked' as const) : ('review' as const),
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
    action: { kind: 'clean_result' as const, id: result.id, status: result.status },
  })).filter((result) => result.status === 'blocked' || !pendingPromotionCleanResultIds.has(result.entityId));

  const promotionTodoItems: DashboardApprovalItem[] = promotionTodos.map((todo) => ({
    key: `promotion-todo-${todo.id}`,
    group: 'review',
    urgencyRank: 2,
    title: todo.text,
    context: todo.bodyMd || 'Task is awaiting promotion approval.',
    requestedAction: 'Review promotion request',
    kind: 'todo',
    status: todo.status,
    entityKind: 'todo',
    entityId: todo.id,
    href: entityHref('todo', todo.id),
    createdAt: iso(todo.createdAt),
    updatedAt: iso(todo.updatedAt),
  }));

  const blockedTodoItems: DashboardApprovalItem[] = blockedTodos.map((todo) => ({
    key: `blocked-todo-${todo.id}`,
    group: 'blocked',
    urgencyRank: 1,
    title: todo.text,
    context: todo.bodyMd || 'Task is blocked and needs owner help.',
    requestedAction: 'Unblock, revise, or archive',
    kind: 'todo',
    status: todo.status,
    entityKind: 'todo',
    entityId: todo.id,
    href: entityHref('todo', todo.id),
    createdAt: iso(todo.createdAt),
    updatedAt: iso(todo.updatedAt),
  }));

  return [
    ...agentItems,
    ...requestItems,
    ...blockedItems,
    ...promotionExperimentItems,
    ...cleanResultItems,
    ...promotionTodoItems,
    ...blockedTodoItems,
  ].sort((a, b) => {
    const rank = a.urgencyRank - b.urgencyRank;
    if (rank !== 0) return rank;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function approvalBucketKey(item: DashboardApprovalItem): DashboardApprovalBucketKey {
  if (item.group === 'blocked' || item.status === 'blocked') return 'blocked';
  if (
    item.group === 'review' ||
    item.kind === 'clean_result_promotion' ||
    item.status === 'awaiting_promotion' ||
    item.status === 'reviewing'
  ) {
    return 'promotion';
  }
  return 'plan';
}

function approvalBucketSummaries(items: DashboardApprovalItem[]): DashboardApprovalBucketSummary[] {
  return (['plan', 'promotion', 'blocked'] as const).map((key) => {
    const bucketItems = items.filter((item) => approvalBucketKey(item) === key);
    return {
      key,
      count: bucketItems.length,
      items: bucketItems,
    };
  });
}

export async function loadShellDashboardState(): Promise<DashboardShellState> {
  const [approvalItems, activeExperiments, activeCleanResults, activeTodos, activeAgents, literatureQueue, recentLog, activePods, runpodAccounts] =
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
      loadActiveRunPods(20),
      loadRunPodAccountSummaries(),
    ]);

  return {
    approvalCount: approvalItems.length,
    activePipelineCount:
      countOf(activeExperiments) + countOf(activeCleanResults) + countOf(activeTodos) + countOf(activeAgents),
    literatureQueueCount: countOf(literatureQueue),
    recentLogCount: countOf(recentLog),
    activePods,
    runpodAccounts,
    topApprovals: approvalItems.slice(0, 8),
    approvalBuckets: approvalBucketSummaries(approvalItems),
  };
}

function experimentStage(status: string, priority: string): PipelineStageKey {
  if (
    priority === 'low' &&
    DEPRIORITIZED_EXPERIMENT_STATUSES.includes(status as (typeof DEPRIORITIZED_EXPERIMENT_STATUSES)[number])
  ) {
    return 'later';
  }
  if (status === 'proposed') return 'idea';
  if (status === 'planning') return 'planning';
  if (status === 'plan_pending' || status === 'awaiting_approval') return 'approval';
  if (status === 'approved' || status === 'queued') return 'queued';
  if (status === 'running' || status === 'verifying') return 'running';
  if (status === 'interpreting') return 'interpreting';
  if (status === 'reviewing' || status === 'awaiting_promotion') return 'review';
  if (status === 'shared' || status === 'completed') return 'done';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  if (status === 'archived' || status === 'cancelled') return 'archived';
  return 'planning';
}

function cleanResultStage(status: string): PipelineStageKey {
  if (status === 'archived') return 'archived';
  if (status === 'reviewing' || status === 'draft') return 'clean_results';
  if (status === 'approved' || status === 'shared') return 'done';
  if (status === 'blocked') return 'blocked';
  return 'clean_results';
}

function pipelineStageFromOwnerNote(ownerNote: string | null | undefined): PipelineStageKey | null {
  const line = ownerNote
    ?.split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(PIPELINE_STAGE_NOTE_PREFIX));
  const stage = line?.slice(PIPELINE_STAGE_NOTE_PREFIX.length);
  return stage && PIPELINE_STAGE_KEYS.has(stage as PipelineStageKey) ? (stage as PipelineStageKey) : null;
}

function todoStage(status: string, priority: string, ownerNote?: string | null): PipelineStageKey {
  if (status === 'archived') return 'archived';
  const explicitStage = pipelineStageFromOwnerNote(ownerNote);
  if (explicitStage) return explicitStage;
  if (priority === 'low' && DEPRIORITIZED_TODO_STATUSES.includes(status as (typeof DEPRIORITIZED_TODO_STATUSES)[number])) {
    return 'later';
  }
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
  if (status === 'cancelled') return 'archived';
  return 'queued';
}

const RUN_PRIORITY: Record<string, number> = {
  running: 6,
  deploying: 6,
  awaiting_approval: 5,
  approved: 4,
  queued: 3,
  blocked: 2,
  failed: 1,
  rejected: 0,
  cancelled: 0,
  completed: 0,
};

function pickHigherPriorityRun<T extends { status: string; updatedAt: Date | string }>(a: T, b: T): T {
  const ra = RUN_PRIORITY[a.status] ?? 0;
  const rb = RUN_PRIORITY[b.status] ?? 0;
  if (ra !== rb) return ra > rb ? a : b;
  const ta = new Date(a.updatedAt).getTime();
  const tb = new Date(b.updatedAt).getTime();
  return ta >= tb ? a : b;
}

export async function loadPipelineCards(): Promise<DashboardPipelineCard[]> {
  const [projectRows, experimentRows, cleanResultRows, todoRows, ideaRows, agentRows, activePodRows] = await Promise.all([
    db().select({ id: projects.id, title: projects.title }).from(projects).limit(500),
    db()
      .select({
        id: experiments.id,
        number: experiments.number,
        title: experiments.title,
        hypothesis: sql<string>`left(coalesce(${experiments.hypothesis}, ''), 220)`,
        status: experiments.status,
        priority: experiments.priority,
        planJson: experiments.planJson,
        projectId: experiments.projectId,
        createdAt: experiments.createdAt,
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
        createdAt: cleanResults.createdAt,
        updatedAt: cleanResults.updatedAt,
      })
      .from(cleanResults)
      .orderBy(desc(cleanResults.updatedAt))
      .limit(200),
    db()
      .select({
        id: todos.id,
        text: todos.text,
        bodyMd: sql<string | null>`left(coalesce(${todos.bodyMd}, ''), 220)`,
        status: todos.status,
        priority: todos.priority,
        ownerNote: todos.ownerNote,
        linkedKind: todos.linkedKind,
        linkedId: todos.linkedId,
        createdAt: todos.createdAt,
        updatedAt: todos.updatedAt,
      })
      .from(todos)
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
        createdAt: ideaCards.createdAt,
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
        lastError: agentRuns.lastError,
        createdAt: agentRuns.createdAt,
        updatedAt: agentRuns.updatedAt,
      })
      .from(agentRuns)
      .where(inArray(agentRuns.status, [...ACTIVE_AGENT_STATUSES]))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(100),
    db()
      .select({
        id: podLifecycle.id,
        podId: podLifecycle.runpodPodId,
        status: podLifecycle.status,
        desiredStatus: podLifecycle.desiredStatus,
        gpuTypeId: podLifecycle.gpuTypeId,
        gpuCount: podLifecycle.gpuCount,
        costPerHr: podLifecycle.costPerHr,
        adjustedCostPerHr: podLifecycle.adjustedCostPerHr,
        uptimeSeconds: podLifecycle.uptimeSeconds,
        lastCheckedAt: podLifecycle.lastCheckedAt,
        lastStartedAt: podLifecycle.lastStartedAt,
        agentRunId: podLifecycle.agentRunId,
        experimentId: podLifecycle.experimentId,
        createdAt: podLifecycle.createdAt,
        updatedAt: podLifecycle.updatedAt,
      })
      .from(podLifecycle)
      .where(inArray(podLifecycle.status, [...ACTIVE_POD_STATUSES]))
      .orderBy(desc(podLifecycle.updatedAt))
      .limit(100),
  ]);

  // Group runs by their scoped entity so each pipeline card can show "claude is
  // working on this" without rendering the run as its own card.
  const runByScope = new Map<string, typeof agentRows[number]>();
  for (const run of agentRows) {
    if (!run.scopeEntityKind || !run.scopeEntityId) continue;
    const key = `${run.scopeEntityKind}:${run.scopeEntityId}`;
    const existing = runByScope.get(key);
    if (!existing || pickHigherPriorityRun(run, existing) === run) {
      runByScope.set(key, run);
    }
  }
  const runForScope = (kind: string, id: string): PipelineCardRun | null => {
    const run = runByScope.get(`${kind}:${id}`);
    if (!run) return null;
    return {
      id: run.id,
      kind: run.kind,
      status: run.status as PipelineRunStatus,
      updatedAt: iso(run.updatedAt),
      lastError: run.lastError,
      href: `/agent/${run.id}`,
      canRetry: ['failed', 'blocked', 'cancelled', 'rejected'].includes(run.status),
    };
  };
  const podByAgentRun = new Map<string, typeof activePodRows>();
  const podByExperiment = new Map<string, typeof activePodRows>();
  for (const pod of activePodRows) {
    if (pod.agentRunId) {
      podByAgentRun.set(pod.agentRunId, [...(podByAgentRun.get(pod.agentRunId) ?? []), pod]);
    }
    if (pod.experimentId) {
      podByExperiment.set(pod.experimentId, [...(podByExperiment.get(pod.experimentId) ?? []), pod]);
    }
  }
  const mapCardPod = (pod: typeof activePodRows[number]): PipelineCardPod => ({
    id: pod.id,
    podId: pod.podId,
    status: pod.status,
    desiredStatus: pod.desiredStatus,
    gpuTypeId: pod.gpuTypeId,
    gpuCount: pod.gpuCount,
    costPerHr: pod.costPerHr,
    adjustedCostPerHr: pod.adjustedCostPerHr,
    uptimeSeconds: pod.uptimeSeconds,
    lastCheckedAt: pod.lastCheckedAt ? iso(pod.lastCheckedAt) : null,
    lastStartedAt: pod.lastStartedAt ? iso(pod.lastStartedAt) : null,
    createdAt: iso(pod.createdAt),
    updatedAt: iso(pod.updatedAt),
    href: pod.agentRunId ? `/agent/${pod.agentRunId}` : pod.experimentId ? entityHref('experiment', pod.experimentId) : '/admin/health',
  });
  const podsForCard = (input: {
    run?: PipelineCardRun | null;
    experimentId?: string | null;
  }): PipelineCardPod[] => {
    const byId = new Map<string, typeof activePodRows[number]>();
    if (input.run?.id) {
      for (const pod of podByAgentRun.get(input.run.id) ?? []) byId.set(pod.id, pod);
    }
    if (input.experimentId) {
      for (const pod of podByExperiment.get(input.experimentId) ?? []) byId.set(pod.id, pod);
    }
    return Array.from(byId.values()).map(mapCardPod);
  };

  const activeExperimentIds = new Set(experimentRows.map((experiment) => experiment.id));
  const referencedExperimentIds = new Set<string>();
  for (const result of cleanResultRows) {
    if (result.experimentId) referencedExperimentIds.add(result.experimentId);
  }
  for (const todo of todoRows) {
    if (todo.linkedKind === 'experiment' && todo.linkedId) referencedExperimentIds.add(todo.linkedId);
  }
  for (const idea of ideaRows) {
    if (idea.promotedKind === 'experiment' && idea.promotedId) referencedExperimentIds.add(idea.promotedId);
  }
  for (const run of agentRows) {
    if (run.scopeEntityKind === 'experiment' && run.scopeEntityId) referencedExperimentIds.add(run.scopeEntityId);
  }
  const missingExperimentIds = Array.from(referencedExperimentIds).filter((id) => !activeExperimentIds.has(id));
  const extraExperimentRows =
    missingExperimentIds.length > 0
      ? await db()
          .select({ id: experiments.id, projectId: experiments.projectId, number: experiments.number })
          .from(experiments)
          .where(inArray(experiments.id, missingExperimentIds))
      : [];
  const experimentReferences = [
    ...experimentRows.map((experiment) => ({ id: experiment.id, projectId: experiment.projectId, number: experiment.number })),
    ...extraExperimentRows,
  ];

  const projectById = new Map(projectRows.map((project) => [project.id, project.title]));
  const experimentProjectById = new Map(experimentReferences.map((experiment) => [experiment.id, experiment.projectId]));
  const experimentMarkerById = new Map(experimentReferences.map((experiment) => [experiment.id, experimentMarker(experiment.number)]));

  const cards: DashboardPipelineCard[] = [
    ...experimentRows.map((experiment) => {
      const run = runForScope('experiment', experiment.id);
      const pods = podsForCard({ run, experimentId: experiment.id });
      const estimate = getExperimentEstimate(experiment.planJson);
      return {
        key: `experiment-${experiment.id}`,
        id: experiment.id,
        stage: experimentStage(experiment.status, experiment.priority),
        kind: 'experiment' as const,
        marker: experimentMarker(experiment.number),
        title: experiment.title,
        detail: experiment.hypothesis || null,
        status: experiment.status,
        project: experiment.projectId ? projectById.get(experiment.projectId) ?? null : null,
        ownerAction: ['plan_pending', 'awaiting_approval', 'blocked', 'awaiting_promotion'].includes(experiment.status)
          ? experimentTurn(experiment.status)
          : null,
        processState: deriveProcessState({ entityKind: 'experiment', status: experiment.status, run, pods }),
        createdAt: iso(experiment.createdAt),
        updatedAt: iso(experiment.updatedAt),
        href: entityHref('experiment', experiment.id),
        tone: statusTone(experiment.status),
        run,
        pods,
        estimatedRemainingMinutes: estimate.remainingMinutes,
        estimatedRemainingUpdatedAt: estimate.updatedAt,
        estimatedRemainingSource: estimate.source,
        estimatedRemainingMessage: estimate.message,
        progressPct: estimate.progressPct,
      };
    }),
    ...cleanResultRows.map((result) => {
      const projectId = result.experimentId ? experimentProjectById.get(result.experimentId) ?? null : null;
      const run = runForScope('clean_result', result.id);
      const pods = podsForCard({ run, experimentId: result.experimentId });
      return {
        key: `clean-result-${result.id}`,
        id: result.id,
        stage: cleanResultStage(result.status),
        kind: 'clean_result' as const,
        marker: result.experimentId ? experimentMarkerById.get(result.experimentId) ?? null : null,
        title: result.title,
        detail: result.claim || null,
        status: result.status,
        project: projectId ? projectById.get(projectId) ?? null : null,
        ownerAction: ['reviewing', 'blocked'].includes(result.status) ? 'Owner turn: review clean result' : null,
        processState: deriveProcessState({ entityKind: 'clean_result', status: result.status, run, pods }),
        createdAt: iso(result.createdAt),
        updatedAt: iso(result.updatedAt),
        href: entityHref('clean_result', result.id),
        tone: statusTone(result.status),
        run,
        pods,
      };
    }),
    ...todoRows.map((todo) => {
      const run = runForScope('todo', todo.id);
      const experimentId = todo.linkedKind === 'experiment' ? todo.linkedId : null;
      const pods = podsForCard({ run, experimentId });
      return {
        key: `todo-${todo.id}`,
        id: todo.id,
        stage: todoStage(todo.status, todo.priority, todo.ownerNote),
        kind: 'todo' as const,
        marker: experimentId ? experimentMarkerById.get(experimentId) ?? null : null,
        title: todo.text,
        detail: todo.bodyMd || null,
        status: todo.status,
        project: null,
        ownerAction: todo.priority === 'urgent' || todo.status === 'blocked' ? `Owner turn: ${todo.priority} task` : null,
        processState: deriveProcessState({ entityKind: 'todo', status: todo.status, run, pods }),
        createdAt: iso(todo.createdAt),
        updatedAt: iso(todo.updatedAt),
        href: entityHref('todo', todo.id),
        tone: todo.priority === 'urgent' ? 'approval' : statusTone(todo.status),
        run,
        pods,
      };
    }),
    ...ideaRows.map((idea) => {
      const status = idea.promotedKind ? 'promoted' : idea.state;
      const pods = podsForCard({ experimentId: idea.promotedKind === 'experiment' ? idea.promotedId : null });
      return {
        key: `idea-${idea.id}`,
        id: idea.id,
        stage: (idea.state === 'archived' ? 'archived' : idea.promotedKind && idea.promotedId ? 'done' : 'idea') as PipelineStageKey,
        kind: 'idea' as const,
        marker: idea.promotedKind === 'experiment' && idea.promotedId ? experimentMarkerById.get(idea.promotedId) ?? null : null,
        title: idea.title,
        detail: idea.bodyMd || null,
        status,
        project: null,
        ownerAction: idea.promotedKind ? null : 'Review or promote idea',
        processState: deriveProcessState({ entityKind: 'idea', status, pods }),
        createdAt: iso(idea.createdAt),
        updatedAt: iso(idea.updatedAt),
        href: idea.promotedKind && idea.promotedId ? entityHref(idea.promotedKind, idea.promotedId) : `/ideation/${idea.sessionId}#idea-${idea.id}`,
        tone: idea.promotedKind ? 'success' : statusTone(idea.state),
        run: null,
        pods,
      };
    }),
    // Standalone automation runs (chat-dock dispatches with no scoped entity)
    // keep rendering as their own cards. Scoped runs are surfaced inline on
    // their parent's card via `card.run`; older scoped failures should remain
    // in the run history, not reappear as separate Pipeline work.
    ...agentRows
      .filter((run) => !run.scopeEntityKind || !run.scopeEntityId)
      .map((run) => {
        const cardRun: PipelineCardRun = {
          id: run.id,
          kind: run.kind,
          status: run.status as PipelineRunStatus,
          updatedAt: iso(run.updatedAt),
          lastError: run.lastError,
          href: `/agent/${run.id}`,
          canRetry: ['failed', 'blocked', 'cancelled', 'rejected'].includes(run.status),
        };
        const pods = podsForCard({
          run: cardRun,
          experimentId: run.scopeEntityKind === 'experiment' ? run.scopeEntityId : null,
        });
        return {
          key: `agent-${run.id}`,
          id: run.id,
          stage: agentStage(run.status),
          kind: 'automation' as const,
          marker: run.scopeEntityKind === 'experiment' && run.scopeEntityId ? experimentMarkerById.get(run.scopeEntityId) ?? null : null,
          title: run.request,
          detail: run.scopeEntityKind && run.scopeEntityId ? `${run.scopeEntityKind} ${run.scopeEntityId.slice(0, 8)}` : run.kind,
          status: run.status,
          project: null,
          ownerAction: run.status === 'awaiting_approval' ? 'Owner turn: approve automation run' : null,
          processState: deriveProcessState({ entityKind: 'run', status: run.status, run: cardRun, pods }),
          createdAt: iso(run.createdAt),
          updatedAt: iso(run.updatedAt),
          href: `/agent/${run.id}`,
          tone: statusTone(run.status),
          run: cardRun,
          pods,
        };
      }),
  ];

  return cards.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
