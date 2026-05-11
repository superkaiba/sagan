import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { CalendarDays } from 'lucide-react';
import { weeklyDigests } from '@sagan/db/schema';
import { EmptyState, ListRow, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';
import { GenerateDigestButton } from './GenerateDigestButton';

export const dynamic = 'force-dynamic';

export default async function DigestsPage() {
  const rows = await db().select().from(weeklyDigests).orderBy(desc(weeklyDigests.weekStart)).limit(52);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly digests"
        description="Advisor-readable weekly findings, open questions, next experiments, and literature read."
        meta={`${rows.length} weeks`}
        actions={
          <>
            <Link href="/results?view=weekly" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
              Results
            </Link>
            <GenerateDigestButton />
          </>
        }
      />

      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
            title="No weekly digests yet"
            message="Generate a digest when you are ready to prepare advisor-facing weekly notes."
          />
        ) : (
          <div className="divide-y divide-[--color-border]">
            {rows.map((digest) => (
              <ListRow
                key={digest.id}
                href={`/digests/${digest.id}`}
                leading={<CalendarDays className="h-4 w-4" aria-hidden="true" />}
                title={`Week of ${digest.weekStart}`}
                detail={digest.bodyMd.slice(0, 220)}
                meta={
                  <span className="inline-flex items-center gap-2">
                    <StatusBadge status={digest.sentAt ? 'sent' : digest.editedAt ? 'edited' : 'draft'} />
                    {digest.shareToken ? <span>shareable</span> : null}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
