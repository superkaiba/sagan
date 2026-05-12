import { eq } from 'drizzle-orm';
import {
  beliefs,
  cleanResults,
  dailyLogEntries,
  experiments,
  litItems,
  projectNarratives,
  projects,
  runs,
  todos,
  weeklyDigests,
} from '@sagan/db/schema';
import { db } from './db';

export type EntityKind =
  | 'project'
  | 'belief'
  | 'experiment'
  | 'run'
  | 'clean_result'
  | 'todo'
  | 'lit_item'
  | 'project_narrative'
  | 'daily_log_entry'
  | 'weekly_digest';

export const ENTITY_KINDS: EntityKind[] = [
  'project',
  'belief',
  'experiment',
  'run',
  'clean_result',
  'todo',
  'lit_item',
  'project_narrative',
  'daily_log_entry',
  'weekly_digest',
];

export const KIND_LABELS: Record<EntityKind, string> = {
  project: 'Project',
  belief: 'Belief',
  experiment: 'Experiment',
  run: 'Run',
  clean_result: 'Clean result',
  todo: 'Task',
  lit_item: 'Paper',
  project_narrative: 'Narrative',
  daily_log_entry: 'Daily log entry',
  weekly_digest: 'Weekly review',
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
        body: row.body ?? row.hypothesis,
        meta: [
          row.number != null ? { label: '#', value: String(row.number) } : null,
          { label: 'kind', value: row.kind },
          { label: 'runpod', value: row.runpodAccount },
        ].filter((m): m is { label: string; value: string } => Boolean(m)),
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
    case 'clean_result': {
      const r = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        body: row.bodyMd,
        meta: [
          { label: 'confidence', value: row.confidence ?? 'unset' },
          { label: 'artifacts', value: row.artifactStatus },
          { label: 'approved', value: row.approvedAt ? 'yes' : 'no' },
          { label: 'shared', value: row.sharedAt ? 'yes' : 'no' },
        ],
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
      const authors = Array.isArray(row.authors)
        ? row.authors
            .map((author) => {
              if (typeof author === 'string') return author;
              if (author && typeof author === 'object' && 'name' in author) {
                return String((author as { name?: unknown }).name ?? '');
              }
              return '';
            })
            .filter(Boolean)
            .join(', ')
        : null;
      return {
        id: row.id,
        title: row.title,
        status: row.readState,
        body: row.abstract,
        meta: [
          { label: 'type', value: row.type },
          ...(authors ? [{ label: 'authors', value: authors }] : []),
          ...(row.releasedOn ? [{ label: 'release date', value: row.releasedOn }] : []),
          ...(row.arxivId ? [{ label: 'arxiv', value: row.arxivId }] : []),
          ...(row.doi ? [{ label: 'doi', value: row.doi }] : []),
          ...(row.summaryMd ? [{ label: 'summary', value: row.summaryMd }] : []),
          ...(row.relevanceReasonMd ? [{ label: 'read next', value: row.relevanceReasonMd }] : []),
          ...(row.threatReasonMd ? [{ label: 'threat/caveat', value: row.threatReasonMd }] : []),
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
    case 'daily_log_entry': {
      const r = await db().select().from(dailyLogEntries).where(eq(dailyLogEntries.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: `${row.kind.replaceAll('_', ' ')} · ${row.day}`,
        status: row.archivedAt ? 'archived' : row.kind,
        body: row.bodyMd,
        meta: [
          { label: 'day', value: row.day },
          { label: 'kind', value: row.kind },
        ],
        raw: row,
      };
    }
    case 'weekly_digest': {
      const r = await db().select().from(weeklyDigests).where(eq(weeklyDigests.id, id)).limit(1);
      const row = r[0];
      if (!row) return null;
      return {
        id: row.id,
        title: `Weekly review · ${row.weekStart}`,
        status: row.sentAt ? 'sent' : row.editedAt ? 'edited' : 'draft',
        body: row.bodyMd,
        meta: [
          { label: 'week', value: row.weekStart },
          { label: 'shared', value: row.shareToken ? 'yes' : 'no' },
        ],
        raw: row,
      };
    }
  }
}
