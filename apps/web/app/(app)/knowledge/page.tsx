import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { beliefs, cleanResults, experiments, litItems, projects, runs, todos } from '@sagan/db/schema';
import { db } from '@/lib/db';
import { KIND_LABELS, type EntityKind } from '@/lib/entity';

export const dynamic = 'force-dynamic';

interface Card {
  kind: EntityKind;
  id: string;
  title: string;
  meta: string;
}

async function recent(): Promise<Card[]> {
  const [proj, bel, exp, cr, rn, td, lit] = await Promise.all([
    db().select().from(projects).orderBy(desc(projects.updatedAt)).limit(20),
    db().select().from(beliefs).orderBy(desc(beliefs.updatedAt)).limit(50),
    db().select().from(experiments).orderBy(desc(experiments.updatedAt)).limit(20),
    db().select().from(cleanResults).orderBy(desc(cleanResults.updatedAt)).limit(20),
    db().select().from(runs).orderBy(desc(runs.updatedAt)).limit(20),
    db().select().from(todos).orderBy(desc(todos.updatedAt)).limit(20),
    db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(20),
  ]);
  return [
    ...proj.map<Card>((p) => ({ kind: 'project', id: p.id, title: p.title, meta: p.status })),
    ...bel.map<Card>((b) => ({
      kind: 'belief',
      id: b.id,
      title: b.title,
      meta: `${b.confidence} · ${b.status}`,
    })),
    ...exp.map<Card>((e) => ({ kind: 'experiment', id: e.id, title: e.title, meta: e.status })),
    ...cr.map<Card>((r) => ({ kind: 'clean_result', id: r.id, title: r.title, meta: r.status })),
    ...rn.map<Card>((r) => ({
      kind: 'run',
      id: r.id,
      title: `Run ${r.id.slice(0, 8)}`,
      meta: r.classification,
    })),
    ...td.map<Card>((t) => ({ kind: 'todo', id: t.id, title: t.text, meta: t.status })),
    ...lit.map<Card>((l) => ({ kind: 'lit_item', id: l.id, title: l.title, meta: l.type })),
  ];
}

export default async function KnowledgePage() {
  const items = await recent();
  const byKind = new Map<EntityKind, Card[]>();
  for (const item of items) {
    const arr = byKind.get(item.kind) ?? [];
    arr.push(item);
    byKind.set(item.kind, arr);
  }

  const kinds: EntityKind[] = ['project', 'belief', 'experiment', 'clean_result', 'run', 'todo', 'lit_item'];

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge</h1>
        <p className="text-sm text-[--color-muted]">{items.length} entities</p>
      </header>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/knowledge/graph" className="rounded-md border border-[--color-border] px-3 py-1.5 hover:bg-[--color-hover]">
          Graph
        </Link>
        <Link href="/beliefs" className="rounded-md border border-[--color-border] px-3 py-1.5 hover:bg-[--color-hover]">
          Beliefs
        </Link>
        <Link href="/library" className="rounded-md border border-[--color-border] px-3 py-1.5 hover:bg-[--color-hover]">
          Library
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {kinds.map((k) => {
          const list = byKind.get(k) ?? [];
          return (
            <section key={k} className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3 space-y-2">
              <header className="flex items-center justify-between">
                <h2 className="text-sm font-medium">{KIND_LABELS[k]}s</h2>
                <span className="text-xs text-[--color-muted]">{list.length}</span>
              </header>
              <ul className="space-y-1">
                {list.length === 0 ? (
                  <li className="text-xs text-[--color-muted]">None yet.</li>
                ) : (
                  list.slice(0, 8).map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/e/${c.kind}/${c.id}`}
                        className="block rounded-md px-2 py-1 text-sm hover:bg-[--color-bg]"
                      >
                        <span className="truncate">{c.title}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-[--color-muted]">
                          {c.meta}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
