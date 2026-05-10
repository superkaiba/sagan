import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { weeklyDigests } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { DigestEditor } from './DigestEditor';

export const dynamic = 'force-dynamic';

export default async function DigestEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const rows = await db().select().from(weeklyDigests).where(eq(weeklyDigests.id, id)).limit(1);
  const row = rows[0];
  if (!row) return notFound();

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link href="/digests" className="text-xs text-[--color-muted] hover:text-[--color-fg]">
          ← all digests
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Week of {row.weekStart}</h1>
        <p className="text-sm text-[--color-muted]">
          drafted {new Date(row.draftedAt).toLocaleString()}
          {row.editedAt ? ` · edited ${new Date(row.editedAt).toLocaleString()}` : ''}
          {row.sentAt ? ` · sent ${new Date(row.sentAt).toLocaleString()}` : ''}
          {row.shareToken ? (
            <>
              {' · '}
              <Link href={`/d/${row.shareToken}`} className="hover:text-[--color-fg]">
                public link
              </Link>
            </>
          ) : null}
        </p>
      </header>
      <DigestEditor id={row.id} initialBody={row.bodyMd} sent={!!row.sentAt} />
    </div>
  );
}
