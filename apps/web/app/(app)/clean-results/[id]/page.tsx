import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { cleanResults } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Comments } from '@/components/Comments';
import { AnchoredCommentsProvider } from '@/components/AnchoredCommentsContext';
import { CommentableBody } from '@/components/CommentableBody';
import { StartIdeationButton } from '@/components/StartIdeationButton';
import { EditableBody } from '@/components/EditableBody';
import { EditableTitle } from '@/components/EditableTitle';
import { ForbiddenError, isOwner, requireEntityRead } from '@/lib/access';
import { requireSession } from '@/lib/auth';
import { CleanResultActions } from './CleanResultActions';

export const dynamic = 'force-dynamic';

export default async function CleanResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  try {
    await requireEntityRead(session, 'clean_result', id);
  } catch (err) {
    if (err instanceof ForbiddenError) return notFound();
    throw err;
  }
  const rows = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
  const result = rows[0];
  if (!result) return notFound();
  const owner = isOwner(session);

  return (
    <AnchoredCommentsProvider>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <main className="min-w-0 space-y-6">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-[--color-muted]">Clean result</p>
          <div className="flex flex-wrap items-baseline gap-2">
            {owner ? (
              <EditableTitle kind="clean_result" id={result.id} initialTitle={result.title} />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">{result.title}</h1>
            )}
            <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{result.status}</span>
            {result.confidence ? (
              <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{result.confidence}</span>
            ) : null}
          </div>
          {owner ? (
            <div className="flex flex-wrap gap-2">
              <CleanResultActions id={result.id} status={result.status} />
              <StartIdeationButton sourceKind="clean_result" sourceId={result.id} />
              {result.status === 'shared' ? (
                <a
                  href={`/mentor/updates?result=${result.id}`}
                  className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs hover:bg-[--color-hover]"
                >
                  Mentor view
                </a>
              ) : null}
            </div>
          ) : null}
        </header>

        {owner ? (
          <EditableBody kind="clean_result" id={result.id} initialBody={result.bodyMd} />
        ) : (
          <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
            <CommentableBody body={result.bodyMd} />
          </section>
        )}
      </main>

      <aside className="min-w-0 space-y-4 xl:border-l xl:border-[--color-border] xl:pl-5">
        <Comments entityKind="clean_result" entityId={result.id} />
      </aside>
      </div>
    </AnchoredCommentsProvider>
  );
}
