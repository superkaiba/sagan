import { notFound } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { cleanResults, shareGrants } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';

export default async function SharedCleanResultPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const grants = await db()
    .select()
    .from(shareGrants)
    .where(
      and(
        eq(shareGrants.token, token),
        eq(shareGrants.entityKind, 'clean_result'),
        gt(shareGrants.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const grant = grants[0];
  if (!grant) return notFound();
  const rows = await db().select().from(cleanResults).where(eq(cleanResults.id, grant.entityId)).limit(1);
  const result = rows[0];
  if (!result || (result.status !== 'approved' && result.status !== 'shared')) return notFound();
  await db().update(shareGrants).set({ usedAt: new Date() }).where(eq(shareGrants.id, grant.id));

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Clean result</p>
        <h1 className="text-3xl font-semibold tracking-tight">{result.title}</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5">{result.status}</span>
          {result.confidence ? (
            <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5">{result.confidence} confidence</span>
          ) : null}
        </div>
      </header>
      <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
        <p className="text-sm font-medium text-[--color-muted]">Claim</p>
        <p className="mt-1">{result.claim}</p>
      </section>
      <Markdown>{result.bodyMd}</Markdown>
    </main>
  );
}
