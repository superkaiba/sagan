import { notFound } from 'next/navigation';
import { isEntityKind, KIND_LABELS, loadEntity } from '@/lib/entity';
import { Comments } from '@/components/Comments';
import { EditableBody } from '@/components/EditableBody';
import { RichBody } from '@/components/RichBody';
import { EditableTitle } from '@/components/EditableTitle';
import { EntityEdges } from '@/components/EntityEdges';
import { BeliefHistoryLink } from '@/components/BeliefHistoryLink';
import { ProjectChildren } from '@/components/ProjectChildren';
import { LoadProjectNarrative } from '@/components/LoadProjectNarrative';
import { LiteratureIntelligencePanel } from '@/components/LiteratureIntelligencePanel';
import { StartIdeationButton } from '@/components/StartIdeationButton';
import { ForbiddenError, isOwner, requireEntityRead } from '@/lib/access';
import { requireSession } from '@/lib/auth';
import { isIdeationSourceKind } from '@/lib/ideation';
import { StatusBadge } from '@/components/ui';

export const dynamic = 'force-dynamic';

type EditableTitleKind =
  | 'project'
  | 'belief'
  | 'todo'
  | 'lit_item'
  | 'project_narrative'
  | 'experiment';

type EditableBodyKind = EditableTitleKind | 'run' | 'daily_log_entry';

function canEditTitle(kind: string): kind is EditableTitleKind {
  return ['project', 'belief', 'todo', 'lit_item', 'project_narrative', 'experiment'].includes(kind);
}

function canEditBody(kind: string): kind is EditableBodyKind {
  return [...['project', 'belief', 'todo', 'lit_item', 'project_narrative', 'experiment'], 'run', 'daily_log_entry'].includes(kind);
}

export default async function EntityPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isEntityKind(kind)) return notFound();
  const session = await requireSession();
  try {
    await requireEntityRead(session, kind, id);
  } catch (err) {
    if (err instanceof ForbiddenError) return notFound();
    throw err;
  }
  const entity = await loadEntity(kind, id);
  if (!entity) return notFound();
  const owner = isOwner(session);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <main className="min-w-0 space-y-6">
        <header className="space-y-2">
          <p className="text-sm text-[--color-muted]">
            {KIND_LABELS[kind]}
          </p>
          {kind === 'run' ? (
            <h1 className="text-2xl font-semibold tracking-tight">{entity.title}</h1>
          ) : owner && canEditTitle(kind) ? (
            <EditableTitle kind={kind} id={entity.id} initialTitle={entity.title} />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{entity.title}</h1>
          )}
          {entity.status ? (
            <p className="text-sm">
              <StatusBadge status={entity.status} />
            </p>
          ) : null}
          {owner && isIdeationSourceKind(kind) ? (
            <StartIdeationButton sourceKind={kind} sourceId={entity.id} />
          ) : null}
        </header>

        {owner && canEditBody(kind) ? (
          <EditableBody kind={kind} id={entity.id} initialBody={entity.body ?? ''} />
        ) : (
          <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
            <RichBody>{entity.body ?? ''}</RichBody>
          </section>
        )}

        {kind === 'belief' ? <BeliefHistoryLink beliefId={entity.id} /> : null}
        {kind === 'project' ? (
          <>
            <LoadProjectNarrative projectId={entity.id} />
            <ProjectChildren projectId={entity.id} />
          </>
        ) : null}

        {kind === 'lit_item' ? <LiteratureIntelligencePanel litItemId={entity.id} /> : null}
      </main>

      <aside className="min-w-0 space-y-4 xl:border-l xl:border-[--color-border] xl:pl-5">
        {entity.meta && entity.meta.length > 0 ? (
          <section className="rounded-lg border border-[--color-border]">
            <div className="border-b border-[--color-border] px-4 py-2 text-sm font-medium">Details</div>
            <dl className="divide-y divide-[--color-border]">
              {entity.meta.map((m) => (
                <div key={m.label} className="grid grid-cols-[6rem_1fr] gap-3 px-4 py-2 text-sm">
                  <dt className="text-[--color-muted]">{m.label}</dt>
                  <dd className="min-w-0 break-all font-mono text-xs">{m.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <EntityEdges entityKind={kind} entityId={entity.id} />
        <Comments entityKind={kind} entityId={entity.id} />
      </aside>
    </div>
  );
}
