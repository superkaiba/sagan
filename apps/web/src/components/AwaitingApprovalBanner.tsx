import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { AlertTriangle } from 'lucide-react';
import { agentRuns, approvalRequests, cleanResults, experiments } from '@sagan/db/schema';
import { db } from '@/lib/db';

/**
 * Inline banner shown at the top of an entity-detail page when that entity
 * (or anything pointing at it) is awaiting an owner decision. Queries are
 * scoped to the entity in question so this stays cheap.
 *
 * Renders nothing if there is nothing pending — drop it in unconditionally.
 */
export async function AwaitingApprovalBanner({
  kind,
  id,
}: {
  kind: string;
  id: string;
}) {
  // approval_requests row pointing at this entity.
  const pendingRequests = await db()
    .select({
      id: approvalRequests.id,
      kind: approvalRequests.kind,
      title: approvalRequests.title,
      requestedState: approvalRequests.requestedState,
      agentRunId: approvalRequests.agentRunId,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.entityKind, kind as never),
        eq(approvalRequests.entityId, id),
        eq(approvalRequests.status, 'pending'),
      ),
    )
    .limit(3);

  const reasons: Array<{ label: string; href: string }> = [];

  for (const req of pendingRequests) {
    reasons.push({
      label: req.requestedState
        ? `${req.title} — review to move to ${req.requestedState.replaceAll('_', ' ')}`
        : req.title,
      href: req.agentRunId ? `/agent/${req.agentRunId}` : '/approvals',
    });
  }

  // Self-blocking states for the canonical kinds.
  if (kind === 'experiment') {
    const rows = await db()
      .select({ id: experiments.id, status: experiments.status })
      .from(experiments)
      .where(eq(experiments.id, id))
      .limit(1);
    const row = rows[0];
    if (row && (row.status === 'blocked' || row.status === 'awaiting_approval' || row.status === 'awaiting_promotion')) {
      reasons.push({
        label: `Experiment is ${row.status.replaceAll('_', ' ')} — owner decision needed`,
        href: '/approvals',
      });
    }
  } else if (kind === 'clean_result') {
    const rows = await db()
      .select({ id: cleanResults.id, status: cleanResults.status })
      .from(cleanResults)
      .where(eq(cleanResults.id, id))
      .limit(1);
    const row = rows[0];
    if (row && (row.status === 'reviewing' || row.status === 'blocked')) {
      reasons.push({
        label: `Clean result is ${row.status} — review or promote`,
        href: '/approvals',
      });
    }
  } else if (kind === 'run') {
    const rows = await db()
      .select({ id: agentRuns.id, status: agentRuns.status })
      .from(agentRuns)
      .where(eq(agentRuns.id, id))
      .limit(1);
    const row = rows[0];
    if (row && row.status === 'awaiting_approval') {
      reasons.push({
        label: 'Agent run is awaiting your approval',
        href: `/agent/${id}`,
      });
    }
  }

  if (reasons.length === 0) return null;

  const primary = reasons[0]!;
  return (
    <div className="rounded-[--radius-panel] border border-[--color-approval] bg-[--color-approval-bg] p-3 text-sm text-[--color-approval] shadow-[var(--shadow-inset)] animate-sagan-approval-pulse">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-semibold">Awaiting your approval</p>
          <ul className="space-y-1 text-sm">
            {reasons.map((reason, idx) => (
              <li key={idx} className="leading-5">
                {reason.label}
              </li>
            ))}
          </ul>
        </div>
        <Link
          href={primary.href}
          className="shrink-0 self-center rounded-[--radius-control] bg-[--color-approval] px-3 py-1.5 text-xs font-semibold text-[--color-panel] hover:opacity-90"
        >
          Review →
        </Link>
      </div>
    </div>
  );
}
