import Link from 'next/link';
import { AlertCircle, CheckCircle2, Kanban, TimerReset } from 'lucide-react';
import { ApprovalQueue } from '@/components/dashboard/ApprovalQueue';
import { buttonClassName, MetricTile, PageHeader } from '@/components/ui';
import { loadApprovalItems } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export default async function ApprovalsPage() {
  const items = await loadApprovalItems();
  const decisions = items.filter((item) => item.group === 'decision').length;
  const blocked = items.filter((item) => item.group === 'blocked').length;
  const reviews = items.filter((item) => item.group === 'review').length;
  const newest = items[0]?.updatedAt;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Owner decisions, blocked work, and clean-result reviews in one queue."
        meta={`${items.length} waiting`}
        actions={
          <Link href="/pipeline" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            <Kanban className="h-4 w-4" aria-hidden="true" />
            Pipeline
          </Link>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Needs decision"
          value={decisions}
          tone={decisions > 0 ? 'approval' : 'neutral'}
          icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricTile
          label="Blocked"
          value={blocked}
          tone={blocked > 0 ? 'danger' : 'neutral'}
          icon={<TimerReset className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricTile
          label="Result review"
          value={reviews}
          tone={reviews > 0 ? 'info' : 'neutral'}
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        />
        <MetricTile
          label="Latest update"
          value={newest ? new Date(newest).toLocaleDateString() : '-'}
          detail={newest ? new Date(newest).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No queue activity'}
        />
      </section>

      <ApprovalQueue items={items} showEmptyGroups />
    </div>
  );
}
