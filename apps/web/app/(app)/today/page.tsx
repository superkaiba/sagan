import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import Link from 'next/link';
import { agentRuns, approvalRequests, cleanResults, dailyLogEntries, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { loadBoard } from '@/lib/kanban';
import { ResearchLog } from './ResearchLog';
import { CleanResultAssistant } from '@/components/today/CleanResultAssistant';

export const dynamic = 'force-dynamic';

const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;

export default async function TodayPage() {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    entries,
    activeRuns,
    pendingApprovals,
    blockedExperiments,
    reviewResults,
    board,
  ] = await Promise.all([
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, today), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt)),
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
    loadBoard('next-steps'),
  ]);
  const cleanResultCount = entries.filter((e) => e.kind === 'clean_result').length;
  const researchEntryCount = entries.filter((e) => e.kind !== 'clean_result' && !ACTION_PREFIX_RE.test(e.bodyMd)).length;
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[--color-border] pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            {today} · {researchEntryCount} research entr{researchEntryCount === 1 ? 'y' : 'ies'} ·{' '}
            {cleanResultCount} result{cleanResultCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/today/${yesterday}`}
            className="rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-1.5 text-xs font-medium hover:bg-[--color-hover]"
          >
            Yesterday
          </Link>
          <a
            href={`/mentor/daily/${today}`}
            className="rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-1.5 text-xs font-medium hover:bg-[--color-hover]"
          >
            Mentor clean log
          </a>
        </div>
      </header>

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

      <NextActions
        initialColumns={board.columns.map((c) => ({
          id: c.id,
          title: c.title,
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
  if (total === 0) return null;

  return (
    <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Needs approval or review</h2>
          <p className="mt-1 text-sm text-[--color-muted]">
            {total} item{total === 1 ? '' : 's'} waiting across approval, blockers, and polish.
          </p>
        </div>
        <Link
          href="/agent"
          className="rounded-md bg-[--color-accent] px-3 py-2 text-sm font-medium text-[--color-accent-fg] hover:opacity-90"
        >
          Review queue
        </Link>
      </div>
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
            label="clean result awaiting polish"
            title={result.title}
            detail={new Date(result.updatedAt).toLocaleString()}
          />
        ))}
      </div>
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

function NextActions({
  initialColumns,
  initialCards,
}: {
  initialColumns: Array<{ id: string; title: string; position: number }>;
  initialCards: Array<{
    id: string;
    columnId: string;
    title: string;
    bodyMd: string | null;
    linkedKind: string | null;
    linkedId: string | null;
    position: number;
  }>;
}) {
  const columnById = new Map(initialColumns.map((column) => [column.id, column]));
  const nextCards = initialCards
    .map((card) => ({ ...card, column: columnById.get(card.columnId) }))
    .sort((a, b) => {
      const rank = nextActionRank(a.column?.title) - nextActionRank(b.column?.title);
      if (rank !== 0) return rank;
      return a.position - b.position;
    })
    .slice(0, 3);

  return (
    <section className="space-y-2">
      <header className="flex items-baseline justify-between border-b border-[--color-border] pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Next actions</h2>
        <Link href="/tasks" className="text-sm text-[--color-accent] hover:underline">
          Open tasks
        </Link>
      </header>
      <div className="divide-y divide-[--color-border] rounded-lg border border-[--color-border] bg-[--color-panel]">
        {nextCards.length === 0 ? (
          <p className="p-4 text-sm text-[--color-muted]">No next actions.</p>
        ) : (
          nextCards.map((card) => (
            <Link
              key={card.id}
              href={card.linkedKind && card.linkedId ? `/e/${card.linkedKind}/${card.linkedId}` : '/tasks'}
              className="block px-4 py-3 hover:bg-[--color-muted-bg]"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="min-w-0 flex-1 truncate text-sm font-medium">{card.title}</h3>
                <span className="text-xs text-[--color-muted]">{card.column?.title ?? 'Next'}</span>
              </div>
              {card.bodyMd ? <p className="mt-1 line-clamp-1 text-sm text-[--color-muted]">{card.bodyMd}</p> : null}
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

function nextActionRank(title: string | undefined) {
  const normalized = title?.toLowerCase() ?? '';
  if (normalized.includes('today')) return 0;
  if (normalized.includes('doing')) return 1;
  if (normalized.includes('await')) return 2;
  if (normalized.includes('backlog')) return 3;
  return 4;
}
