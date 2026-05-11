import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { CheckCircle2 } from 'lucide-react';
import { cleanResults } from '@sagan/db/schema';
import { EmptyState, ListRow, PageHeader, Panel, StatusBadge, buttonClassName } from '@/components/ui';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CleanResultsPage() {
  const rows = await db().select().from(cleanResults).orderBy(desc(cleanResults.updatedAt)).limit(120);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Clean results"
        description="Durable findings, review state, confidence, and share workflow."
        meta={`${rows.length} recent`}
        actions={
          <Link href="/results?view=findings" className={buttonClassName({ variant: 'secondary', size: 'md' })}>
            Findings
          </Link>
        }
      />
      <Panel className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            title="No clean results yet"
            message="Reviewed experiment outputs will appear here as clean, shareable claims."
          />
        ) : (
          <div className="divide-y divide-[--color-border]">
            {rows.map((result) => (
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
    </div>
  );
}
