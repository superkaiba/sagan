import { notFound } from 'next/navigation';
import { isEntityKind, KIND_LABELS, loadEntity } from '@/lib/entity';
import { Comments } from '@/components/Comments';
import { EditableBody } from '@/components/EditableBody';
import { EntityEdges } from '@/components/EntityEdges';

export const dynamic = 'force-dynamic';

export default async function EntityPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  if (!isEntityKind(kind)) return notFound();
  const entity = await loadEntity(kind, id);
  if (!entity) return notFound();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[--color-muted]">
          {KIND_LABELS[kind]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{entity.title}</h1>
        {entity.status ? (
          <p className="text-sm">
            <span className="rounded-full bg-[--color-muted-bg] px-2 py-0.5 text-xs">{entity.status}</span>
          </p>
        ) : null}
      </header>

      <EditableBody kind={kind} id={entity.id} initialBody={entity.body ?? ''} />

      {entity.meta && entity.meta.length > 0 ? (
        <section className="rounded-lg border border-[--color-border]">
          <dl className="divide-y divide-[--color-border]">
            {entity.meta.map((m) => (
              <div key={m.label} className="grid grid-cols-[8rem_1fr] gap-4 px-4 py-2 text-sm">
                <dt className="text-[--color-muted]">{m.label}</dt>
                <dd className="font-mono text-xs break-all">{m.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <EntityEdges entityKind={kind} entityId={entity.id} />

      <Comments entityKind={kind} entityId={entity.id} />
    </div>
  );
}
