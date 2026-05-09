import { desc, eq } from 'drizzle-orm';
import {
  beliefs,
  edges,
  experiments,
  litItems,
  projectNarratives,
  projects,
  runs,
  todos,
} from '@eps/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';

export interface GraphNode {
  kind: EntityKind;
  id: string;
  title: string;
  meta?: string | null;
}
export interface GraphEdge {
  id: string;
  fromKind: EntityKind;
  fromId: string;
  toKind: EntityKind;
  toId: string;
  type: string;
}

const NODE_LIMIT_PER_KIND = 80;

export async function loadGraph(filter?: { projectId?: string }): Promise<{
  nodes: GraphNode[];
  edges: GraphEdge[];
}> {
  const projQ = db().select().from(projects).orderBy(desc(projects.updatedAt));
  const proj = filter?.projectId
    ? await projQ.where(eq(projects.id, filter.projectId))
    : await projQ.limit(NODE_LIMIT_PER_KIND);

  const beliefQ = db().select().from(beliefs).orderBy(desc(beliefs.updatedAt));
  const bel = filter?.projectId
    ? await beliefQ.where(eq(beliefs.projectId, filter.projectId))
    : await beliefQ.limit(NODE_LIMIT_PER_KIND);

  const expQ = db().select().from(experiments).orderBy(desc(experiments.updatedAt));
  const exp = filter?.projectId
    ? await expQ.where(eq(experiments.projectId, filter.projectId))
    : await expQ.limit(NODE_LIMIT_PER_KIND);

  const [rn, td, lit, narr] = await Promise.all([
    db().select().from(runs).orderBy(desc(runs.updatedAt)).limit(NODE_LIMIT_PER_KIND),
    db().select().from(todos).orderBy(desc(todos.updatedAt)).limit(NODE_LIMIT_PER_KIND),
    db().select().from(litItems).orderBy(desc(litItems.updatedAt)).limit(NODE_LIMIT_PER_KIND),
    db()
      .select()
      .from(projectNarratives)
      .orderBy(desc(projectNarratives.updatedAt))
      .limit(NODE_LIMIT_PER_KIND),
  ]);

  const nodes: GraphNode[] = [
    ...proj.map<GraphNode>((p) => ({ kind: 'project', id: p.id, title: p.title, meta: p.status })),
    ...bel.map<GraphNode>((b) => ({
      kind: 'belief',
      id: b.id,
      title: b.title,
      meta: `${b.confidence} · ${b.status}`,
    })),
    ...exp.map<GraphNode>((e) => ({ kind: 'experiment', id: e.id, title: e.title, meta: e.status })),
    ...rn.map<GraphNode>((r) => ({
      kind: 'run',
      id: r.id,
      title: `run ${r.id.slice(0, 8)}`,
      meta: r.classification,
    })),
    ...td.map<GraphNode>((t) => ({ kind: 'todo', id: t.id, title: t.text, meta: t.status })),
    ...lit.map<GraphNode>((l) => ({
      kind: 'lit_item',
      id: l.id,
      title: l.title,
      meta: l.type,
    })),
    ...narr.map<GraphNode>((n) => ({
      kind: 'project_narrative',
      id: n.id,
      title: n.title,
      meta: n.status,
    })),
  ];

  const nodeKey = (k: EntityKind, id: string) => `${k}:${id}`;
  const known = new Set(nodes.map((n) => nodeKey(n.kind, n.id)));

  // Implicit edges from FKs (project → belief, experiment, narrative; belief → experiment).
  const fkEdges: GraphEdge[] = [
    ...bel
      .filter((b) => b.projectId)
      .map<GraphEdge>((b) => ({
        id: `fk:project-belief:${b.id}`,
        fromKind: 'project',
        fromId: b.projectId!,
        toKind: 'belief',
        toId: b.id,
        type: 'parent',
      })),
    ...exp
      .filter((e) => e.projectId)
      .map<GraphEdge>((e) => ({
        id: `fk:project-experiment:${e.id}`,
        fromKind: 'project',
        fromId: e.projectId!,
        toKind: 'experiment',
        toId: e.id,
        type: 'parent',
      })),
    ...exp
      .filter((e) => e.beliefId)
      .map<GraphEdge>((e) => ({
        id: `fk:belief-experiment:${e.id}`,
        fromKind: 'belief',
        fromId: e.beliefId!,
        toKind: 'experiment',
        toId: e.id,
        type: 'tests',
      })),
    ...narr.map<GraphEdge>((n) => ({
      id: `fk:project-narrative:${n.id}`,
      fromKind: 'project',
      fromId: n.projectId,
      toKind: 'project_narrative',
      toId: n.id,
      type: 'parent',
    })),
  ];

  // Explicit edges from the edges table.
  const explicit = await db().select().from(edges).limit(1000);

  const allEdges: GraphEdge[] = [
    ...fkEdges,
    ...explicit.map<GraphEdge>((e) => ({
      id: e.id,
      fromKind: e.fromKind,
      fromId: e.fromId,
      toKind: e.toKind,
      toId: e.toId,
      type: e.type,
    })),
  ].filter((e) => known.has(nodeKey(e.fromKind, e.fromId)) && known.has(nodeKey(e.toKind, e.toId)));

  return { nodes, edges: allEdges };
}
