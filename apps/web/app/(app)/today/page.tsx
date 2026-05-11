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
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [
    entries,
    yesterdayEntries,
    activeExperiments,
    activeRuns,
    pendingApprovals,
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
      .select({ id: agentRuns.id, kind: agentRuns.kind, status: agentRuns.status, request: agentRuns.request, updatedAt: agentRuns.updatedAt })
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
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, 'pending'))
      .orderBy(desc(approvalRequests.createdAt))
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
          value={String(activeRuns.length + pendingApprovals.length)}
          detail={activeRuns[0]?.request ?? pendingApprovals[0]?.title ?? 'Nothing waiting'}
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
        agentRuns={activeRuns.map((run) => ({
          id: run.id,
          kind: run.kind,
          request: run.request,
          updatedAt: run.updatedAt.toISOString(),
        }))}
        approvals={pendingApprovals.map((request) => ({
          id: request.id,
          kind: request.kind,
          title: request.title,
          entityKind: request.entityKind,
          entityId: request.entityId,
          createdAt: request.createdAt.toISOString(),
        }))}
        cleanResults={reviewResults.map((result) => ({
          id: result.id,
          title: result.title,
          status: result.status,
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
  agentRuns,
  approvals,
  cleanResults,
}: {
  agentRuns: Array<{ id: string; kind: string; request: string; updatedAt: string }>;
  approvals: Array<{ id: string; kind: string; title: string; entityKind: string; entityId: string; createdAt: string }>;
  cleanResults: Array<{ id: string; title: string; status: string; updatedAt: string }>;
}) {
  const total = agentRuns.length + approvals.length + cleanResults.length;
  return (
    <section
      className={`rounded-lg border p-4 ${
        total > 0
          ? 'border-[--color-danger] bg-[--color-panel]'
          : 'border-[--color-border] bg-[--color-panel]'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[--color-border] pb-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Needs approval or review</h2>
          <p className="mt-1 text-sm text-[--color-muted]">
            {total === 0 ? 'Nothing is waiting on you.' : `${total} item${total === 1 ? '' : 's'} waiting on you.`}
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
          {agentRuns.map((run) => (
            <Link
              key={run.id}
              href={`/agent/${run.id}`}
              data-clickable="true"
              className="rounded-md border border-[--color-border] bg-[--color-bg] p-3 hover:border-[--color-accent] hover:bg-[--color-hover]"
            >
              <p className="text-xs font-semibold text-[--color-danger]">Agent approval</p>
              <p className="mt-1 line-clamp-2 text-sm">{run.request}</p>
              <p className="mt-2 text-xs text-[--color-muted]">{run.kind} · {new Date(run.updatedAt).toLocaleString()}</p>
            </Link>
          ))}
          {approvals.map((request) => (
            <Link
              key={request.id}
              href={`/e/${request.entityKind}/${request.entityId}`}
              data-clickable="true"
              className="rounded-md border border-[--color-border] bg-[--color-bg] p-3 hover:border-[--color-accent] hover:bg-[--color-hover]"
            >
              <p className="text-xs font-semibold text-[--color-danger]">Approval request</p>
              <p className="mt-1 line-clamp-2 text-sm">{request.title}</p>
              <p className="mt-2 text-xs text-[--color-muted]">{request.kind} · {new Date(request.createdAt).toLocaleString()}</p>
            </Link>
          ))}
          {cleanResults.map((result) => (
            <Link
              key={result.id}
              href={`/clean-results/${result.id}`}
              data-clickable="true"
              className="rounded-md border border-[--color-border] bg-[--color-bg] p-3 hover:border-[--color-accent] hover:bg-[--color-hover]"
            >
              <p className="text-xs font-semibold text-[--color-danger]">Clean result review</p>
              <p className="mt-1 line-clamp-2 text-sm">{result.title}</p>
              <p className="mt-2 text-xs text-[--color-muted]">{result.status} · {new Date(result.updatedAt).toLocaleString()}</p>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
