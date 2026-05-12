import { listApiTokens } from '@sagan/auth';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { PageHeader, Panel } from '@/components/ui';
import { ApiTokensClient, type ListedApiToken } from './ApiTokensClient';

export const dynamic = 'force-dynamic';

export default async function ApiTokensPage() {
  const session = await requireSession();
  const rows = await listApiTokens(db(), session.user.id);
  const tokens: ListedApiToken[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt ? r.lastUsedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="API tokens"
        description="Long-lived bearer tokens for scripts and integrations. Replay as Authorization: Bearer sk_…"
      />
      <Panel className="space-y-4 p-4">
        <ApiTokensClient initialTokens={tokens} />
      </Panel>
    </div>
  );
}
