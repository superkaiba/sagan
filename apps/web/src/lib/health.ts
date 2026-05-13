import { desc, inArray, sql } from 'drizzle-orm';
import {
  agentRuns,
  experiments,
  jobRuns,
  notifications,
  podLifecycle,
} from '@sagan/db/schema';
import { db } from './db';

const ACTIVE_AGENT_STATUSES = [
  'queued',
  'running',
  'awaiting_approval',
  'approved',
  'deploying',
  'blocked',
] satisfies Array<typeof agentRuns.$inferSelect.status>;

const ACTIVE_POD_STATUSES = [
  'queued',
  'deploying',
  'running',
  'retrying',
  'stop_requested',
] satisfies Array<typeof podLifecycle.$inferSelect.status>;

const ACTIVE_EXPERIMENT_STATUSES = [
  'proposed',
  'clarifying',
  'gate_pending',
  'planning',
  'plan_pending',
  'approved',
  'queued',
  'implementing',
  'code_reviewing',
  'testing',
  'running',
  'uploading',
  'verifying',
  'interpreting',
  'reviewing',
  'awaiting_promotion',
  'followups_running',
  'blocked',
] satisfies Array<typeof experiments.$inferSelect.status>;

export async function loadHealthSummary() {
  const [
    agentStatusCounts,
    activeRuns,
    recentJobs,
    notificationCounts,
    activePods,
    activeExperiments,
  ] = await Promise.all([
    db()
      .select({ status: agentRuns.status, count: sql<number>`count(*)::int` })
      .from(agentRuns)
      .groupBy(agentRuns.status),
    db()
      .select({
        id: agentRuns.id,
        kind: agentRuns.kind,
        status: agentRuns.status,
        request: agentRuns.request,
        updatedAt: agentRuns.updatedAt,
        lastError: agentRuns.lastError,
      })
      .from(agentRuns)
      .where(inArray(agentRuns.status, ACTIVE_AGENT_STATUSES))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(20),
    db()
      .select({
        id: jobRuns.id,
        kind: jobRuns.kind,
        status: jobRuns.status,
        createdAt: jobRuns.createdAt,
        completedAt: jobRuns.completedAt,
        lastError: jobRuns.lastError,
      })
      .from(jobRuns)
      .orderBy(desc(jobRuns.createdAt))
      .limit(20),
    db()
      .select({
        emailStatus: notifications.emailStatus,
        count: sql<number>`count(*)::int`,
      })
      .from(notifications)
      .groupBy(notifications.emailStatus),
    db()
      .select({
        id: podLifecycle.id,
        agentRunId: podLifecycle.agentRunId,
        experimentId: podLifecycle.experimentId,
        runpodPodId: podLifecycle.runpodPodId,
        status: podLifecycle.status,
        costPerHr: podLifecycle.costPerHr,
        adjustedCostPerHr: podLifecycle.adjustedCostPerHr,
        uptimeSeconds: podLifecycle.uptimeSeconds,
        lastCheckedAt: podLifecycle.lastCheckedAt,
        lastStartedAt: podLifecycle.lastStartedAt,
        createdAt: podLifecycle.createdAt,
        lastError: podLifecycle.lastError,
        updatedAt: podLifecycle.updatedAt,
      })
      .from(podLifecycle)
      .where(inArray(podLifecycle.status, ACTIVE_POD_STATUSES))
      .orderBy(desc(podLifecycle.updatedAt))
      .limit(20),
    db()
      .select({
        id: experiments.id,
        title: experiments.title,
        status: experiments.status,
        updatedAt: experiments.updatedAt,
      })
      .from(experiments)
      .where(inArray(experiments.status, ACTIVE_EXPERIMENT_STATUSES))
      .orderBy(desc(experiments.updatedAt))
      .limit(20),
  ]);

  return {
    agentStatusCounts,
    activeRuns,
    recentJobs,
    notificationCounts,
    activePods,
    activeExperiments,
    generatedAt: new Date().toISOString(),
  };
}
