import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { weeklyDigests } from '@eps/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';

export const dynamic = 'force-dynamic';

/**
 * Public weekly digest by share token. No auth required.
 */
export default async function PublicWeeklyDigest({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const rows = await db()
    .select()
    .from(weeklyDigests)
    .where(eq(weeklyDigests.shareToken, token))
    .limit(1);
  const row = rows[0];
  if (!row) return notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-4">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">Weekly digest</p>
        <h1 className="text-2xl font-semibold tracking-tight">Week of {row.weekStart}</h1>
      </header>
      <article className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-6">
        <Markdown>{row.bodyMd}</Markdown>
      </article>
      <footer className="border-t border-[--color-border] pt-4 text-[10px] uppercase tracking-wide text-[--color-muted]">
        Sagan
      </footer>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
