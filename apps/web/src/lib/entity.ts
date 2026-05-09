import { eq } from 'drizzle-orm';
import {
  beliefs,
  experiments,
  litItems,
  projectNarratives,
  projects,
  runs,
  todos,
} from '@eps/db/schema';
import { db } from './db';

export type EntityKind =
  | 'project'
  | 'belief'
  | 'experiment'
  | 'run'
  | 'todo'
  | 'lit_item'
  | 'project_narrative';

export const ENTITY_KINDS: EntityKind[] = [
  'project',
  'belief',
  'experiment',
  'run',
  'todo',
  'lit_item',
  'project_narrative',
];

export const KIND_LABELS: Record<EntityKind, string> = {
  project: 'Project',
  belief: 'Belief',
  experiment: 'Experiment',
  run: 'Run',
  todo: 'Task',
  lit_item: 'Paper',
  project_narrative: 'Narrative',
};

export function isEntityKind(s: string): s is EntityKind {
  return (ENTITY_KINDS as string[]).includes(s);
}

export interface EntityRow {
  id: string;
  title: string;
  status?: string | null;
  body?: string | null;
  meta?: Array<{ label: string; value: string }>;
  raw: Record<string, unknown>;
}

export async function loadEntity(kind: EntityKind, id: string): Promise<EntityRow | null> {
  switch (kind) {
    case 'project': {
      const r = await db().select().from(projects).where(eq(projects.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        body: row.summaryMd,
        meta: [
          { label: 'slug', value: row.slug },
          { label: 'public', value: String(row.public) },
        ],
        raw: row,
      };
    }
    case 'belief': {
      const r = await db().select().from(beliefs).where(eq(beliefs.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        body: row.currentBelief ?? row.denseDescription,
        meta: [
          { label: 'confidence', value: row.confidence },
          { label: 'topic', value: row.topic ?? '—' },
        ],
        raw: row,
      };
    }
    case 'experiment': {
      const r = await db().select().from(experiments).where(eq(experiments.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        body: row.hypothesis,
        meta: [
          { label: 'runpod', value: row.runpodAccount },
        ],
        raw: row,
      };
    }
    case 'run': {
      const r = await db().select().from(runs).where(eq(runs.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: `Run ${row.id.slice(0, 8)}`,
        status: row.classification,
        body: row.notesMd,
        meta: [
          row.wandbUrl ? { label: 'wandb', value: row.wandbUrl } : null,
          row.hfUrl ? { label: 'hf', value: row.hfUrl } : null,
        ].filter((m): m is { label: string; value: string } => Boolean(m)),
        raw: row,
      };
    }
    case 'todo': {
      const r = await db().select().from(todos).where(eq(todos.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.text,
        status: row.status,
        body: row.bodyMd,
        meta: [
          { label: 'priority', value: row.priority },
          ...(row.intentMode ? [{ label: 'intent', value: row.intentMode }] : []),
        ],
        raw: row,
      };
    }
    case 'lit_item': {
      const r = await db().select().from(litItems).where(eq(litItems.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.readState,
        body: row.abstract,
        meta: [
          { label: 'type', value: row.type },
          ...(row.arxivId ? [{ label: 'arxiv', value: row.arxivId }] : []),
          ...(row.doi ? [{ label: 'doi', value: row.doi }] : []),
        ],
        raw: row,
      };
    }
    case 'project_narrative': {
      const r = await db()
        .select()
        .from(projectNarratives)
        .where(eq(projectNarratives.id, id))
        .limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        body: row.bodyMd,
        meta: [],
        raw: row,
      };
    }
  }
}
