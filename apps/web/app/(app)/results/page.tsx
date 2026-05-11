import Link from 'next/link';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { BarChart3, CalendarDays, CheckCircle2, FileText, ListChecks } from 'lucide-react';
import { cleanResults, dailyLogEntries, weeklyDigests } from '@sagan/db/schema';
import { ApprovalQueue } from '@/components/dashboard/ApprovalQueue';
import { CleanResultAssistant } from '@/components/today/CleanResultAssistant';
import { EmptyState, ListRow, MetricTile, PageHeader, Panel, SegmentedControl, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { loadApprovalItems } from '@/lib/dashboard';
import { loadBoard } from '@/lib/kanban';
import { ResearchLog } from '../today/ResearchLog';
import { GenerateDigestButton } from '../digests/GenerateDigestButton';

export const dynamic = 'force-dynamic';

const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;
const VIEWS = ['daily', 'weekly', 'findings'] as const;
type ResultsView = (typeof VIEWS)[number];

function normalizeView(value: string | string[] | undefined): ResultsView {
  const view = Array.isArray(value) ? value[0] : value;
  return VIEWS.includes(view as ResultsView) ? (view as ResultsView) : 'daily';
}

function resultSnippet(value: string) {
  return value.length > 220 ? `${value.slice(0, 220)}...` : value;
}

function NextActions({
  cards,
}: {
  cards: Array<{
    id: string;
    title: string;
    bodyMd: string | null;
    linkedKind: string | null;
    linkedId: string | null;
  }>;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex min-h-12 items-center justify-between border-b border-[--color-border] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Next steps</h2>
        <Link href="/pipeline" className="text-sm font-medium text-[--color-accent] hover:underline">
          Pipeline
        </Link>
      </div>
      <div className="divide-y divide-[--color-border]">
        {cards.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[--color-muted]">No next steps are queued.</p>
        ) : (
          cards.map((card) => (
            <ListRow
              key={card.id}
              href={card.linkedKind && card.linkedId ? `/e/${card.linkedKind}/${card.linkedId}` : '/pipeline'}
              leading={<ListChecks className="h-4 w-4" aria-hidden="true" />}
              title={card.title}
              detail={card.bodyMd}
            />
          ))
        )}
      </div>
    </Panel>
  );
}

export default async function ResultsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const view = normalizeView(params.view);
  const today = new Date().toISOString().slice(0, 10);

  const [entries, approvals, board, digests, findings] = await Promise.all([
    db()
      .select()
      .from(dailyLogEntries)
      .where(and(eq(dailyLogEntries.day, today), isNull(dailyLogEntries.archivedAt)))
      .orderBy(asc(dailyLogEntries.position), asc(dailyLogEntries.createdAt)),
    loadApprovalItems(50),
    loadBoard('next-steps'),
    db().select().from(weeklyDigests).orderBy(desc(weeklyDigests.weekStart)).limit(24),
    db().select().from(cleanResults).where(inArray(cleanResults.status, ['draft', 'reviewing', 'approved', 'shared', 'blocked'])).orderBy(desc(cleanResults.updatedAt)).limit(120),
  ]);

  const cleanResultCount = entries.filter((entry) => entry.kind === 'clean_result').length;
  const researchEntryCount = entries.filter((entry) => entry.kind !== 'clean_result' && !ACTION_PREFIX_RE.test(entry.bodyMd)).length;
  const blockers = entries.filter((entry) => entry.kind === 'blocker').length + approvals.filter((item) => item.group === 'blocked').length;
  const nextCards = board.cards
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, 5)
    .map((card) => ({
      id: card.id,
      title: card.title,
      bodyMd: card.bodyMd,
      linkedKind: card.linkedKind,
      linkedId: card.linkedId,
    }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Daily work log, weekly advisor digest, and durable findings."
        actions={<GenerateDigestButton />}
      />

      <SegmentedControl
        items={[
          { label: 'Daily', href: '/results?view=daily', active: view === 'daily', count: entries.length },
          { label: 'Weekly', href: '/results?view=weekly', active: view === 'weekly', count: digests.length },
          { label: 'Findings', href: '/results?view=findings', active: view === 'findings', count: findings.length },
        ]}
      />

      {view === 'daily' ? (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-4">
            <MetricTile label="Research entries" value={researchEntryCount} icon={<FileText className="h-4 w-4" aria-hidden="true" />} />
            <MetricTile label="Clean results" value={cleanResultCount} tone={cleanResultCount > 0 ? 'success' : 'neutral'} />
            <MetricTile label="Approvals" value={approvals.filter((item) => item.group === 'decision').length} tone="approval" />
            <MetricTile label="Blockers" value={blockers} tone={blockers > 0 ? 'danger' : 'neutral'} />
          </section>

          {approvals.length > 0 ? <ApprovalQueue items={approvals.slice(0, 5)} /> : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              <NextActions cards={nextCards} />
              <ResearchLog
                day={today}
                initialEntries={entries.map((entry) => ({
                  id: entry.id,
                  kind: entry.kind,
                  bodyMd: entry.bodyMd,
                  createdAt: entry.createdAt.toISOString(),
                }))}
              />
            </div>
            <CleanResultAssistant day={today} cleanResultCount={cleanResultCount} />
          </div>
        </div>
      ) : null}

      {view === 'weekly' ? (
        <Panel className="overflow-hidden">
          <div className="flex min-h-12 items-center justify-between border-b border-[--color-border] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Weekly digests</h2>
            <Link href="/digests" className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
              Open digests
            </Link>
          </div>
          {digests.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
              title="No weekly digest yet"
              message="Generated weekly digests will appear here for advisor review and sharing."
            />
          ) : (
            <div className="divide-y divide-[--color-border]">
              {digests.map((digest) => (
                <ListRow
                  key={digest.id}
                  href={`/digests/${digest.id}`}
                  leading={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
                  title={`Week of ${digest.weekStart}`}
                  detail={resultSnippet(digest.bodyMd)}
                  meta={digest.sentAt ? 'sent' : digest.editedAt ? 'edited' : 'draft'}
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {view === 'findings' ? (
        <Panel className="overflow-hidden">
          <div className="flex min-h-12 items-center justify-between border-b border-[--color-border] px-4 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Findings</h2>
            <Link href="/clean-results" className={buttonClassName({ variant: 'secondary', size: 'sm' })}>
              Clean results
            </Link>
          </div>
          {findings.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
              title="No findings yet"
              message="Clean results will appear here after experiments produce reviewable claims."
            />
          ) : (
            <div className="divide-y divide-[--color-border]">
              {findings.map((result) => (
                <ListRow
                  key={result.id}
                  href={`/clean-results/${result.id}`}
                  leading={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                  title={result.title}
                  detail={result.claim}
                  meta={
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge status={result.status} />
                      {result.confidence ? <span>{result.confidence}</span> : null}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
