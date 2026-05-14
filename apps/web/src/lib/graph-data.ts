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
} from '@sagan/db/schema';
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
  // Only project the columns the graph actually renders (id/title/meta + the
  // FK columns used to infer edges). Avoids pulling heavy text/JSON fields
  // (planJson, bodyMd, abstract, summaryMd, etc.) that are never displayed in
  // a node tile — those weighed in at hundreds of KB per response.
  const projQ = db()
    .select({ id: projects.id, title: projects.title, status: projects.status })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
  const proj = filter?.projectId
    ? await projQ.where(eq(projects.id, filter.projectId))
    : await projQ.limit(NODE_LIMIT_PER_KIND);

  const beliefQ = db()
    .select({
      id: beliefs.id,
      title: beliefs.title,
      confidence: beliefs.confidence,
      status: beliefs.status,
      projectId: beliefs.projectId,
    })
    .from(beliefs)
    .orderBy(desc(beliefs.updatedAt));
  const bel = filter?.projectId
    ? await beliefQ.where(eq(beliefs.projectId, filter.projectId))
    : await beliefQ.limit(NODE_LIMIT_PER_KIND);

  const expQ = db()
    .select({
      id: experiments.id,
      title: experiments.title,
      status: experiments.status,
      projectId: experiments.projectId,
      beliefId: experiments.beliefId,
    })
    .from(experiments)
    .orderBy(desc(experiments.updatedAt));
  const exp = filter?.projectId
    ? await expQ.where(eq(experiments.projectId, filter.projectId))
    : await expQ.limit(NODE_LIMIT_PER_KIND);

  const [rn, td, lit, narr] = await Promise.all([
    db()
      .select({ id: runs.id, classification: runs.classification })
      .from(runs)
      .orderBy(desc(runs.updatedAt))
      .limit(NODE_LIMIT_PER_KIND),
    db()
      .select({ id: todos.id, text: todos.text, status: todos.status })
      .from(todos)
      .orderBy(desc(todos.updatedAt))
      .limit(NODE_LIMIT_PER_KIND),
    db()
      .select({ id: litItems.id, title: litItems.title, type: litItems.type })
      .from(litItems)
      .orderBy(desc(litItems.updatedAt))
      .limit(NODE_LIMIT_PER_KIND),
    db()
      .select({
        id: projectNarratives.id,
        title: projectNarratives.title,
        status: projectNarratives.status,
        projectId: projectNarratives.projectId,
      })
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

  // Explicit edges from the edges table. Project only what the graph uses
  // (skip `note`, which is unbounded text and never rendered on a node).
  const explicit = await db()
    .select({
      id: edges.id,
      fromKind: edges.fromKind,
      fromId: edges.fromId,
      toKind: edges.toKind,
      toId: edges.toId,
      type: edges.type,
    })
    .from(edges)
    .limit(1000);

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
