import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { agentRuns, approvalRequests, cleanResults, dailyLogEntries, experiments, weeklyDigests } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { loadBoard } from '@/lib/kanban';
import { ResearchLog } from './ResearchLog';
import { Kanban } from './Kanban';
import { CleanResultAssistant } from '@/components/today/CleanResultAssistant';

export const dynamic = 'force-dynamic';

export default async function TodayPage() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    entries,
    yesterdayEntries,
    activeExperiments,
    activeRuns,
    pendingApprovals,
    blockedExperiments,
    reviewResults,
    latestWeeklyRows,
    board,
  ] = await Promise.all([
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, today), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt)),
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, yesterday), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt)),
    db()
      .select({ id: experiments.id, title: experiments.title, status: experiments.status })
      .from(experiments)
      .where(eq(experiments.status, 'running'))
      .limit(5),
    db()
      .select({
        id: agentRuns.id,
        kind: agentRuns.kind,
        status: agentRuns.status,
        request: agentRuns.request,
        scopeEntityKind: agentRuns.scopeEntityKind,
        scopeEntityId: agentRuns.scopeEntityId,
        updatedAt: agentRuns.updatedAt,
      })
      .from(agentRuns)
      .where(eq(agentRuns.status, 'awaiting_approval'))
      .orderBy(desc(agentRuns.updatedAt))
      .limit(5),
    db()
      .select({
        id: approvalRequests.id,
        kind: approvalRequests.kind,
        title: approvalRequests.title,
        entityKind: approvalRequests.entityKind,
        entityId: approvalRequests.entityId,
        agentRunId: approvalRequests.agentRunId,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, 'pending'))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(5),
    db()
      .select({ id: experiments.id, title: experiments.title, status: experiments.status, updatedAt: experiments.updatedAt })
      .from(experiments)
      .where(eq(experiments.status, 'blocked'))
      .orderBy(desc(experiments.updatedAt))
      .limit(5),
    db()
      .select({ id: cleanResults.id, title: cleanResults.title, status: cleanResults.status, updatedAt: cleanResults.updatedAt })
      .from(cleanResults)
      .where(inArray(cleanResults.status, ['reviewing', 'blocked']))
      .orderBy(desc(cleanResults.updatedAt))
      .limit(5),
    db().select().from(weeklyDigests).orderBy(desc(weeklyDigests.weekStart)).limit(1),
    loadBoard('next-steps'),
  ]);
  const cleanResultCount = entries.filter((e) => e.kind === 'clean_result').length;
  const actionTrailCount = entries.filter((e) => e.bodyMd.startsWith('**Action:**')).length;
  const yesterdayCleanResults = yesterdayEntries.filter((e) => e.kind === 'clean_result').length;
  const latestWeekly = latestWeeklyRows[0] ?? null;
  const activeRunIds = new Set(activeRuns.map((run) => run.id));
  const activeExperimentApprovalIds = new Set(
    activeRuns
      .filter((run) => run.scopeEntityKind === 'experiment' && run.scopeEntityId)
      .map((run) => run.scopeEntityId!),
  );
  const visiblePendingApprovals = pendingApprovals.filter((request) => {
    if (request.agentRunId && activeRunIds.has(request.agentRunId)) return false;
    return !(request.kind === 'experiment_plan' && activeExperimentApprovalIds.has(request.entityId));
  });
  const planApprovals = [
    ...activeRuns.map((run) => ({
      id: run.id,
      title: run.request,
      href: `/agent/${run.id}`,
      detail: `${run.kind} · ${run.updatedAt.toISOString()}`,
    })),
    ...visiblePendingApprovals.map((request) => ({
      id: request.id,
      title: request.title,
      href: `/e/${request.entityKind}/${request.entityId}`,
      detail: `${request.kind} · ${request.createdAt.toISOString()}`,
    })),
  ];
  const blockedCleanResults = reviewResults.filter((result) => result.status === 'blocked');
  const polishingCleanResults = reviewResults.filter((result) => result.status === 'reviewing');
  const blockedItems = [
    ...blockedExperiments.map((experiment) => ({
      id: experiment.id,
      title: experiment.title,
      href: `/e/experiment/${experiment.id}`,
      detail: `experiment · ${experiment.updatedAt.toISOString()}`,
    })),
    ...blockedCleanResults.map((result) => ({
      id: result.id,
      title: result.title,
      href: `/clean-results/${result.id}`,
      detail: `clean result · ${result.updatedAt.toISOString()}`,
    })),
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[--color-border] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            {today} · {actionTrailCount} trail note{actionTrailCount === 1 ? '' : 's'}
          </p>
        </div>
        <a
          href={`/mentor/daily/${today}`}
          className="rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-1.5 text-xs font-medium hover:bg-[--color-hover]"
        >
          Mentor clean log
        </a>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Running experiments"
          value={String(activeExperiments.length)}
          detail={activeExperiments[0]?.title ?? 'No running experiments'}
          href="/experiments"
        />
        <SummaryCard
          label="Owner approvals"
          value={String(activeRuns.length + visiblePendingApprovals.length)}
          detail={activeRuns[0]?.request ?? visiblePendingApprovals[0]?.title ?? 'Nothing waiting'}
          href="/agent"
        />
        <SummaryCard
          label="Yesterday"
          value={`${yesterdayCleanResults} result${yesterdayCleanResults === 1 ? '' : 's'}`}
          detail={yesterday}
          href={`/today/${yesterday}`}
        />
        <SummaryCard
          label="Weekly review"
          value={latestWeekly ? (latestWeekly.sentAt ? 'sent' : latestWeekly.editedAt ? 'edited' : 'draft') : 'none'}
          detail={latestWeekly ? `Week of ${latestWeekly.weekStart}` : 'Generate from Digests'}
          href={latestWeekly ? `/digests/${latestWeekly.id}` : '/digests'}
        />
      </section>

      <ReviewQueue
        planApprovals={planApprovals}
        blockedItems={blockedItems}
        cleanResults={polishingCleanResults.map((result) => ({
          id: result.id,
          title: result.title,
          href: `/clean-results/${result.id}`,
          updatedAt: result.updatedAt.toISOString(),
        }))}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ResearchLog
          day={today}
          initialEntries={entries.map((e) => ({
            id: e.id,
            kind: e.kind,
          bodyMd: e.bodyMd,
          createdAt: e.createdAt.toISOString(),
        }))}
        />
        <CleanResultAssistant day={today} cleanResultCount={cleanResultCount} />
      </div>

      <Kanban
        slug={board.slug}
        initialColumns={board.columns.map((c) => ({
          id: c.id,
          title: c.title,
          color: c.color,
          position: c.position,
        }))}
        initialCards={board.cards.map((c) => ({
          id: c.id,
          columnId: c.columnId,
          title: c.title,
          bodyMd: c.bodyMd,
          linkedKind: c.linkedKind,
          linkedId: c.linkedId,
          position: c.position,
        }))}
      />
    </div>
  );
}

function SummaryCard({ label, value, detail, href }: { label: string; value: string; detail: string; href: string }) {
  return (
    <Link
      href={href}
      data-clickable="true"
      className="block rounded-lg border border-[--color-border] bg-[--color-panel] p-3 hover:border-[--color-accent] hover:bg-[--color-hover]"
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-xs text-[--color-muted]">{detail}</p>
    </Link>
  );
}

function ReviewQueue({
  planApprovals,
  blockedItems,
  cleanResults,
}: {
  planApprovals: Array<{ id: string; title: string; href: string; detail: string }>;
  blockedItems: Array<{ id: string; title: string; href: string; detail: string }>;
  cleanResults: Array<{ id: string; title: string; href: string; updatedAt: string }>;
}) {
  const total = planApprovals.length + blockedItems.length + cleanResults.length;
  return (
    <section
      className={`rounded-lg border p-4 ${
        total > 0
          ? 'border-[--color-border] bg-[--color-panel]'
          : 'border-[--color-border] bg-[--color-panel]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Needs approval or review</h2>
          <p className="mt-1 text-sm text-[--color-muted]">
            {total === 0 ? 'Nothing is waiting on you.' : `${total} item${total === 1 ? '' : 's'} waiting across approval, blockers, and polish.`}
          </p>
        </div>
        {total > 0 ? (
          <Link
            href="/agent"
            className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-[--color-accent-fg] hover:opacity-90"
          >
            Review queue
          </Link>
        ) : null}
      </div>
      {total > 0 ? (
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {planApprovals.map((item) => (
            <QueueCard key={item.id} tone="success" href={item.href} label="plan awaiting approval" title={item.title} detail={item.detail} />
          ))}
          {blockedItems.map((item) => (
            <QueueCard key={item.id} tone="danger" href={item.href} label="blocked" title={item.title} detail={item.detail} />
          ))}
          {cleanResults.map((result) => (
            <QueueCard
              key={result.id}
              tone="info"
              href={result.href}
              label="clean results awaiting polishing"
              title={result.title}
              detail={new Date(result.updatedAt).toLocaleString()}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function QueueCard({
  tone,
  href,
  label,
  title,
  detail,
}: {
  tone: 'success' | 'danger' | 'info';
  href: string;
  label: string;
  title: string;
  detail: string;
}) {
  const toneVar =
    tone === 'success' ? 'var(--color-success)' : tone === 'danger' ? 'var(--color-danger)' : 'var(--color-info)';

  return (
    <Link
      href={href}
      data-clickable="true"
      className="rounded-md border border-l-4 p-3 hover:bg-[--color-hover]"
      style={{
        background: `color-mix(in srgb, ${toneVar} 12%, var(--color-panel))`,
        borderColor: `color-mix(in srgb, ${toneVar} 38%, var(--color-border))`,
        borderLeftColor: toneVar,
      }}
    >
      <p className="text-xs font-semibold" style={{ color: toneVar }}>
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-sm">{title}</p>
      <p className="mt-2 text-xs text-[--color-muted]">{formatQueueDetail(detail)}</p>
    </Link>
  );
}

function formatQueueDetail(detail: string) {
  const [prefix, timestamp] = detail.split(' · ');
  if (!timestamp) return detail;
  return `${prefix} · ${new Date(timestamp).toLocaleString()}`;
}
