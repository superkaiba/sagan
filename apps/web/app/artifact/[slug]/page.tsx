import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { publishedArtifacts } from '@sagan/db/schema';
import { Markdown } from '@/components/Markdown';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function PublicArtifactPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rows = await db()
    .select()
    .from(publishedArtifacts)
    .where(eq(publishedArtifacts.slug, slug))
    .limit(1);
  const artifact = rows[0];
  if (!artifact || !artifact.public) return notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <article className="space-y-5">
        <header className="border-b border-[--color-border] pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{artifact.title}</h1>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[--color-muted]">
            <span>{artifact.source}</span>
            <time>{new Date(artifact.updatedAt).toLocaleString()}</time>
          </div>
          {artifact.summary ? (
            <p className="mt-3 text-sm leading-6 text-[--color-muted]">{artifact.summary}</p>
          ) : null}
        </header>
        <Markdown>{artifact.bodyMd}</Markdown>
      </article>
    </main>
  );
}

export const metadata = {
  robots: { index: false, follow: false },
};
