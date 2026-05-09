import { NextResponse } from 'next/server';
import { sql, ilike, or } from 'drizzle-orm';
import { beliefs, experiments, litItems, projects, todos } from '@eps/db/schema';
import { db } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import type { EntityKind } from '@/lib/entity';

interface Hit {
  kind: EntityKind;
  id: string;
  title: string;
  meta: string;
}

export async function GET(req: Request) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ hits: [] });
  const pattern = `%${q}%`;

  const [proj, bel, exp, td, lit] = await Promise.all([
    db()
      .select({ id: projects.id, title: projects.title, status: projects.status, slug: projects.slug })
      .from(projects)
      .where(or(ilike(projects.title, pattern), ilike(projects.slug, pattern), ilike(sql`coalesce(${projects.summaryMd}, '')`, pattern)))
      .limit(8),
    db()
      .select({ id: beliefs.id, title: beliefs.title, status: beliefs.status, topic: beliefs.topic })
      .from(beliefs)
      .where(or(ilike(beliefs.title, pattern), ilike(sql`coalesce(${beliefs.currentBelief}, '')`, pattern)))
      .limit(8),
    db()
      .select({ id: experiments.id, title: experiments.title, status: experiments.status })
      .from(experiments)
      .where(or(ilike(experiments.title, pattern), ilike(sql`coalesce(${experiments.hypothesis}, '')`, pattern)))
      .limit(6),
    db()
      .select({ id: todos.id, text: todos.text, status: todos.status })
      .from(todos)
      .where(ilike(todos.text, pattern))
      .limit(6),
    db()
      .select({ id: litItems.id, title: litItems.title, type: litItems.type })
      .from(litItems)
      .where(or(ilike(litItems.title, pattern), ilike(sql`coalesce(${litItems.abstract}, '')`, pattern)))
      .limit(6),
  ]);

  const hits: Hit[] = [
    ...proj.map<Hit>((p) => ({ kind: 'project', id: p.id, title: p.title, meta: p.status })),
    ...bel.map<Hit>((b) => ({
      kind: 'belief',
      id: b.id,
      title: b.title,
      meta: b.topic ? `${b.status} · ${b.topic}` : b.status,
    })),
    ...exp.map<Hit>((e) => ({ kind: 'experiment', id: e.id, title: e.title, meta: e.status })),
    ...td.map<Hit>((t) => ({ kind: 'todo', id: t.id, title: t.text, meta: t.status })),
    ...lit.map<Hit>((l) => ({ kind: 'lit_item', id: l.id, title: l.title, meta: l.type })),
  ];
  return NextResponse.json({ hits });
}
