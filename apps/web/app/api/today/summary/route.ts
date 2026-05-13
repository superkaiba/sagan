import { NextResponse } from 'next/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  agentRuns,
  approvalRequests,
  dailyLogEntries,
  experiments,
  weeklyDigests,
} from '@sagan/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';

const ACTIVE_EXPERIMENT_STATUSES = [
  'proposed',
  'clarifying',
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

const ACTIVE_AGENT_STATUSES = [
  'awaiting_approval',
  'approved',
  'deploying',
  'running',
  'blocked',
  'failed',
] satisfies Array<typeof agentRuns.$inferSelect.status>;

function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = isoDate();
  const yesterday = isoDate(-1);
  const [
    todayEntries,
    yesterdayEntries,
    activeExperiments,
    activeAgentRuns,
    pendingApprovals,
    latestWeeklyRows,
  ] = await Promise.all([
    db()
      .select({ kind: dailyLogEntries.kind, bodyMd: dailyLogEntries.bodyMd })
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, today), isNull(dailyLogEntries.archivedAt))),
    db()
      .select({ kind: dailyLogEntries.kind, bodyMd: dailyLogEntries.bodyMd })
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, yesterday), isNull(dailyLogEntries.archivedAt))),
    db()
      .select({ id: experiments.id, title: experiments.title, status: experiments.status, updatedAt: experiments.updatedAt })
      .from(experiments)
      .where(inArray(experiments.status, ACTIVE_EXPERIMENT_STATUSES))
      .orderBy(desc(experiments.updatedAt))
      .limit(8),
    db()
      .select({ id: agentRuns.id, kind: agentRuns.kind, status: agentRuns.status, request: agentRuns.request, updatedAt: agentRuns.updatedAt })
      .from(agentRuns)
      .where(inArray(agentRuns.status, ACTIVE_AGENT_STATUSES))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(8),
    db()
      .select({ id: approvalRequests.id, kind: approvalRequests.kind, title: approvalRequests.title })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, 'pending'))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(8),
    db().select().from(weeklyDigests).orderBy(desc(weeklyDigests.weekStart)).limit(1),
  ]);

  return NextResponse.json({
    today,
    yesterday,
    counts: {
      todayCleanResults: todayEntries.filter((entry) => entry.kind === 'clean_result').length,
      todayBlockers: todayEntries.filter((entry) => entry.kind === 'blocker').length,
      yesterdayCleanResults: yesterdayEntries.filter((entry) => entry.kind === 'clean_result').length,
      activeExperiments: activeExperiments.length,
      activeAgentRuns: activeAgentRuns.length,
      pendingApprovals: pendingApprovals.length,
    },
    activeExperiments,
    activeAgentRuns,
    pendingApprovals,
    latestWeeklyDigest: latestWeeklyRows[0] ?? null,
  });
}
