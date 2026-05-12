import { notFound } from 'next/navigation';
import { desc, eq, or } from 'drizzle-orm';
import { cleanResults, cleanResultVersions, runArtifacts } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { Markdown } from '@/components/Markdown';
import { AwaitingApprovalBanner } from '@/components/AwaitingApprovalBanner';
import { Comments } from '@/components/Comments';
import { EntityEdges } from '@/components/EntityEdges';
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
  const filters = [
    result.runId ? eq(runArtifacts.runId, result.runId) : undefined,
    result.agentRunId ? eq(runArtifacts.agentRunId, result.agentRunId) : undefined,
    result.experimentId ? eq(runArtifacts.experimentId, result.experimentId) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const [artifacts, versions] = await Promise.all([
    filters.length
      ? db()
          .select()
          .from(runArtifacts)
          .where(filters.length === 1 ? filters[0]! : or(...filters))
          .orderBy(runArtifacts.createdAt)
      : Promise.resolve([]),
    db()
      .select()
      .from(cleanResultVersions)
      .where(eq(cleanResultVersions.cleanResultId, id))
      .orderBy(desc(cleanResultVersions.createdAt))
      .limit(20),
  ]);
  const owner = isOwner(session);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <main className="min-w-0 space-y-6">
        <AwaitingApprovalBanner kind="clean_result" id={result.id} />
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

        <section className="rounded-lg border border-[--color-border] bg-[--color-panel] p-4">
          <p className="text-sm font-medium text-[--color-muted]">Claim</p>
          <p className="mt-1">{result.claim}</p>
        </section>

        {owner ? (
          <EditableBody kind="clean_result" id={result.id} initialBody={result.bodyMd} />
        ) : (
          <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
            <Markdown>{result.bodyMd}</Markdown>
          </section>
        )}
      </main>

      <aside className="min-w-0 space-y-4 xl:border-l xl:border-[--color-border] xl:pl-5">
        <section className="rounded-lg border border-[--color-border]">
          <div className="border-b border-[--color-border] px-4 py-2 text-sm font-medium">Verified artifacts</div>
          {artifacts.length === 0 ? (
            <p className="p-4 text-sm text-[--color-muted]">No artifacts linked.</p>
          ) : (
            <div className="divide-y divide-[--color-border]">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="space-y-1 px-4 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{artifact.kind}</span>
                    <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{artifact.status}</span>
                  </div>
                  <p className="break-all font-mono text-xs text-[--color-muted]">{artifact.uri}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <EntityEdges entityKind="clean_result" entityId={result.id} />

        <section className="rounded-lg border border-[--color-border]">
          <div className="border-b border-[--color-border] px-4 py-2 text-sm font-medium">Versions</div>
          {versions.length === 0 ? (
            <p className="p-4 text-sm text-[--color-muted]">No versions yet.</p>
          ) : (
            <div className="divide-y divide-[--color-border]">
              {versions.map((version) => (
                <div key={version.id} className="px-4 py-2 text-xs text-[--color-muted]">
                  {new Date(version.createdAt).toLocaleString()} · {version.authorKind}
                </div>
              ))}
            </div>
          )}
        </section>

        <Comments entityKind="clean_result" entityId={result.id} />
      </aside>
    </div>
  );
}
