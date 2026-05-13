import Link from 'next/link';
import { desc, inArray, sql } from 'drizzle-orm';
import { approvalRequests, experiments, workflowEvents } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { experimentTurn } from '@/lib/workflow';
import { StatusBadge } from '@/components/ui';
import { ExperimentProposalForm } from './ExperimentProposalForm';
import { ExperimentStatusButton } from './ExperimentStatusButton';

export const dynamic = 'force-dynamic';

const QUEUE_STATUSES = [
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
] as const;

export default async function ExperimentsPage() {
  const [queue, pendingApprovals, events] = await Promise.all([
    db()
      .select({
        id: experiments.id,
        title: experiments.title,
        hypothesis: sql<string>`left(coalesce(${experiments.hypothesis}, ${experiments.body}, ''), 360)`,
        status: experiments.status,
        updatedAt: experiments.updatedAt,
      })
      .from(experiments)
      .where(inArray(experiments.status, [...QUEUE_STATUSES]))
      .orderBy(desc(experiments.updatedAt))
      .limit(100),
    db()
      .select({
        id: approvalRequests.id,
        kind: approvalRequests.kind,
        title: approvalRequests.title,
        requestedState: approvalRequests.requestedState,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      .where(inArray(approvalRequests.status, ['pending']))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(50),
    db()
      .select({
        id: workflowEvents.id,
        eventType: workflowEvents.eventType,
        fromStatus: workflowEvents.fromStatus,
        toStatus: workflowEvents.toStatus,
        note: workflowEvents.note,
        createdAt: workflowEvents.createdAt,
      })
      .from(workflowEvents)
      .where(inArray(workflowEvents.entityKind, ['experiment']))
      .orderBy(desc(workflowEvents.createdAt))
      .limit(30),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
          <p className="mt-1 text-sm text-[--color-muted]">
            {queue.length} active proposal{queue.length === 1 ? '' : 's'} · {pendingApprovals.length} pending approval{pendingApprovals.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link href="/agent" className="rounded-md border border-[--color-border] px-3 py-2 text-sm hover:border-[--color-fg]">
          Agent runs
        </Link>
      </header>

      <ExperimentProposalForm />

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Approval queue</h2>
          <p className="text-xs text-[--color-muted]">
            proposed · clarifying · planning · plan_pending · approved · queued · running · interpreting · reviewing · awaiting_promotion
          </p>
        </div>
        <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
          {queue.length === 0 ? (
            <p className="p-4 text-sm text-[--color-muted]">No active experiments.</p>
          ) : (
            queue.map((experiment) => (
              <article key={experiment.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={experiment.status} />
                      <span className="text-xs text-[--color-muted]">{experimentTurn(experiment.status)}</span>
                    </div>
                    <Link href={`/e/experiment/${experiment.id}`} className="block truncate text-sm font-medium hover:underline">
                      {experiment.title}
                    </Link>
                    {experiment.hypothesis ? (
                      <p className="line-clamp-2 text-sm text-[--color-muted]">{experiment.hypothesis}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {experiment.status === 'proposed' ? (
                      <ExperimentStatusButton
                        experimentId={experiment.id}
                        status="clarifying"
                        label="Clarify"
                        note="Move proposal to clarifying before full planning."
                        variant="primary"
                      />
                    ) : null}
                    {experiment.status === 'clarifying' ? (
                      <ExperimentStatusButton
                        experimentId={experiment.id}
                        status="planning"
                        label="Start planning"
                        note="Clarification is sufficient to start planning."
                        variant="primary"
                      />
                    ) : null}
                    {experiment.status === 'planning' ? (
                      <ExperimentStatusButton
                        experimentId={experiment.id}
                        status="plan_pending"
                        label="Request approval"
                        note="Move proposal to plan-pending for owner approval."
                        variant="primary"
                      />
                    ) : null}
                    {experiment.status === 'plan_pending' ? (
                      <>
                        <ExperimentStatusButton
                          experimentId={experiment.id}
                          status="approved"
                          label="Approve"
                          note="Owner approved the experiment plan."
                          variant="primary"
                        />
                        <ExperimentStatusButton
                          experimentId={experiment.id}
                          status="planning"
                          label="Defer"
                          note="Owner deferred the experiment plan for revision."
                        />
                      </>
                    ) : null}
                    {experiment.status !== 'blocked' ? (
                      <ExperimentStatusButton
                        experimentId={experiment.id}
                        status="blocked"
                        label="Block"
                        note="Owner marked this workflow blocked."
                        variant="danger"
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Pending requests</h2>
          <div className="rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
            {pendingApprovals.length === 0 ? (
              <p className="p-4 text-sm text-[--color-muted]">No pending approvals.</p>
            ) : (
              pendingApprovals.map((request) => (
                <div key={request.id} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{request.title}</p>
                    <span className="text-xs text-[--color-muted]">{request.kind}</span>
                  </div>
                  <p className="text-xs text-[--color-muted]">
                    Requested state: {request.requestedState ?? 'n/a'} · created {new Date(request.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">State timeline</h2>
          <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-[--color-border] divide-y divide-[--color-border]">
            {events.length === 0 ? (
              <p className="p-4 text-sm text-[--color-muted]">No workflow events yet.</p>
            ) : (
              events.map((event) => (
                <div key={event.id} className="p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{event.eventType}</span>
                    <span className="text-xs text-[--color-muted]">{new Date(event.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-xs text-[--color-muted]">
                    {event.fromStatus ?? 'start'} {'->'} {event.toStatus ?? 'n/a'}
                  </p>
                  {event.note ? <p className="mt-1 text-sm">{event.note}</p> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
