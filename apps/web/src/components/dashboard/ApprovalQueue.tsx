import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { DashboardApprovalItem } from '@/lib/dashboard';
import { formatRelativeTime, statusLabel } from '@/lib/status';
import { buttonClassName, EmptyState, Panel, StatusBadge } from '@/components/ui';
import { ApprovalActionButtons } from './ApprovalActionButtons';

const GROUPS: Array<{
  key: DashboardApprovalItem['group'];
  title: string;
  empty: string;
}> = [
  { key: 'decision', title: 'Needs decision', empty: 'No approval requests are waiting.' },
  { key: 'blocked', title: 'Blocked', empty: 'No blockers need owner input.' },
  { key: 'review', title: 'Result review', empty: 'No clean results are waiting for review.' },
];

export function ApprovalQueue({
  items,
  showEmptyGroups = false,
}: {
  items: DashboardApprovalItem[];
  showEmptyGroups?: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
        title="Nothing is waiting"
        message="Approvals, blocked work, and clean-result reviews will appear here when they need owner attention."
        action={
          <Link href="/pipeline" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            Open Pipeline
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group.key);
        if (!showEmptyGroups && groupItems.length === 0) return null;
        return (
          <Panel key={group.key} variant={group.key === 'decision' ? 'urgent' : 'default'} className="overflow-hidden">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[--color-border] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight">{group.title}</h2>
              <span className="font-mono text-xs text-[--color-muted]">{groupItems.length}</span>
            </div>
            {groupItems.length === 0 ? (
              <p className="px-4 py-4 text-sm text-[--color-muted]">{group.empty}</p>
            ) : (
              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {groupItems.map((item) => (
                  <article
                    key={item.key}
                    className="border border-[--color-border] bg-[--color-panel] shadow-[var(--shadow-inset)]"
                  >
                    <Link href={item.href} data-clickable="true" className="group block min-h-[10rem] p-4 text-[--color-fg] no-underline hover:bg-[--color-hover]">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <StatusBadge status={item.status} />
                        <span className="text-xs text-[--color-muted]">{statusLabel(item.kind)}</span>
                        <span className="text-xs text-[--color-muted]">{formatRelativeTime(item.updatedAt)}</span>
                      </div>
                      <h3 className="mt-2 text-sm font-semibold leading-5 text-[--color-fg] group-hover:text-[--color-accent]">
                        {item.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[--color-muted]">{item.context}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs text-[--color-muted]">
                        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{item.requestedAction}</span>
                      </div>
                    </Link>
                    {item.action ? (
                      <div className="border-t border-[--color-border] px-3 py-3">
                        <ApprovalActionButtons action={item.action} />
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
