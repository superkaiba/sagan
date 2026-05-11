import { desc, eq, inArray } from 'drizzle-orm';
import {
  beliefs,
  cleanResults,
  ideaCards,
  ideaSessions,
  litItems,
  projects,
} from '@sagan/db/schema';
import { db } from './db';
import type { EntityKind } from './entity';

export const IDEATION_SOURCE_KINDS = ['clean_result', 'belief', 'lit_item', 'project'] as const;
export type IdeationSourceKind = (typeof IDEATION_SOURCE_KINDS)[number];

export const PROMOTION_KINDS = [
  'experiment',
  'belief_update',
  'literature_task',
  'clean_result_question',
] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export interface IdeationSource {
  kind: IdeationSourceKind;
  id: string;
  title: string;
  body: string;
  status?: string | null;
}

interface NearbyContext {
  beliefs: Array<{ id: string; title: string; body: string | null }>;
  literature: Array<{ id: string; title: string; reason: string | null; threat: string | null }>;
  cleanResults: Array<{ id: string; title: string; claim: string }>;
}

export function isIdeationSourceKind(value: string): value is IdeationSourceKind {
  return (IDEATION_SOURCE_KINDS as readonly string[]).includes(value);
}

export async function loadIdeationSource(kind: IdeationSourceKind, id: string): Promise<IdeationSource | null> {
  switch (kind) {
    case 'clean_result': {
      const rows = await db().select().from(cleanResults).where(eq(cleanResults.id, id)).limit(1);
      const row = rows[0];
      return row
        ? { kind, id: row.id, title: row.title, body: [row.claim, row.bodyMd].filter(Boolean).join('\n\n'), status: row.status }
        : null;
    }
    case 'belief': {
      const rows = await db().select().from(beliefs).where(eq(beliefs.id, id)).limit(1);
      const row = rows[0];
      return row
        ? {
            kind,
            id: row.id,
            title: row.title,
            body: [row.currentBelief, row.evidence, row.counterevidence, row.nextTest].filter(Boolean).join('\n\n'),
            status: row.status,
          }
        : null;
    }
    case 'lit_item': {
      const rows = await db().select().from(litItems).where(eq(litItems.id, id)).limit(1);
      const row = rows[0];
      return row
        ? {
            kind,
            id: row.id,
            title: row.title,
            body: [row.summaryMd, row.relevanceReasonMd, row.threatReasonMd, row.abstract].filter(Boolean).join('\n\n'),
            status: row.readState,
          }
        : null;
    }
    case 'project': {
      const rows = await db().select().from(projects).where(eq(projects.id, id)).limit(1);
      const row = rows[0];
      return row ? { kind, id: row.id, title: row.title, body: row.summaryMd ?? '', status: row.status } : null;
    }
  }
}

export async function buildPromptDeck(source: IdeationSource): Promise<string[]> {
  const nearby = await loadNearbyContext(source);
  const literaturePrompt = nearby.literature[0]
    ? `What would change if "${nearby.literature[0].title}" is right?`
    : `Which recent paper would most threaten "${source.title}"?`;
  const beliefPrompt = nearby.beliefs[0]
    ? `How should "${nearby.beliefs[0].title}" change if this source is replicated?`
    : `What belief would this source most strongly update?`;
  return [
    `What assumption behind "${source.title}" would fail first?`,
    `What variable in "${source.title}" has never been ablated?`,
    `What would a skeptical collaborator ask before trusting this?`,
    `What cheap experiment would make this source less ambiguous?`,
    literaturePrompt,
    beliefPrompt,
    `What clean result would be worth writing if this line of work succeeds?`,
    `What would make this result not matter?`,
  ];
}

export async function generateIdeaCardDrafts(sessionId: string, answer?: string) {
  const sessionRows = await db()
    .select()
    .from(ideaSessions)
    .where(eq(ideaSessions.id, sessionId))
    .limit(1);
  const session = sessionRows[0];
  if (!session || !isIdeationSourceKind(session.sourceKind)) return null;
  const source = await loadIdeationSource(session.sourceKind, session.sourceId);
  if (!source) return null;
  const nearby = await loadNearbyContext(source);
  const note = [session.notesMd, answer].filter(Boolean).join('\n\n').slice(0, 1200);
  const lit = nearby.literature[0];
  const belief = nearby.beliefs[0];
  const cleanResult = nearby.cleanResults[0];
  const cards = [
    {
      title: `Stress-test ${source.title}`,
      bodyMd: [
        `## Experiment proposal`,
        `Test the weakest assumption in "${source.title}" with one narrow ablation or negative control.`,
        `## Hypothesis`,
        `If the source is robust, the main claim should survive a deliberately adversarial setup.`,
        `## Useful context`,
        [belief ? `Belief: ${belief.title}` : null, lit ? `Paper: ${lit.title}` : null, note ? `Session note: ${note}` : null]
          .filter(Boolean)
          .join('\n'),
      ].join('\n\n'),
    },
    {
      title: `Find the disconfirming read for ${source.title}`,
      bodyMd: [
        `## Literature task`,
        lit?.threat
          ? `Use the existing threat signal: ${lit.threat}`
          : `Look for a paper, benchmark, or failure report that would make "${source.title}" less trustworthy.`,
        `## Search angle`,
        `Prefer caveats, negative controls, failed replications, and benchmark artifacts over supportive background.`,
      ].join('\n\n'),
    },
    {
      title: `Convert ${source.title} into a sharper claim`,
      bodyMd: [
        `## Belief or clean-result update`,
        cleanResult
          ? `Compare against clean result "${cleanResult.title}": ${cleanResult.claim}`
          : `Write the smallest claim that would remain true if this source was only partially correct.`,
        `## Next question`,
        `What exact observation would make the claim stronger, weaker, or irrelevant?`,
      ].join('\n\n'),
    },
  ];

  const inserted = await db()
    .insert(ideaCards)
    .values(
      cards.map((card) => ({
        ...card,
        sessionId,
        sourceKind: source.kind,
        sourceId: source.id,
        authorKind: 'sagan',
        state: 'draft',
      })),
    )
    .returning();
  return inserted;
}

async function loadNearbyContext(source: IdeationSource): Promise<NearbyContext> {
  const [beliefRows, litRows, resultRows] = await Promise.all([
    db()
      .select({
        id: beliefs.id,
        title: beliefs.title,
        body: beliefs.currentBelief,
      })
      .from(beliefs)
      .where(inArray(beliefs.status, ['active', 'supported', 'weakened', 'draft']))
      .orderBy(desc(beliefs.updatedAt))
      .limit(4),
    db()
      .select({
        id: litItems.id,
        title: litItems.title,
        reason: litItems.relevanceReasonMd,
        threat: litItems.threatReasonMd,
      })
      .from(litItems)
      .orderBy(desc(litItems.lastRankedAt), desc(litItems.updatedAt))
      .limit(4),
    db()
      .select({
        id: cleanResults.id,
        title: cleanResults.title,
        claim: cleanResults.claim,
      })
      .from(cleanResults)
      .orderBy(desc(cleanResults.updatedAt))
      .limit(4),
  ]);
  return { beliefs: beliefRows, literature: litRows, cleanResults: resultRows };
}

export function promotionTargetKind(kind: PromotionKind): EntityKind {
  return kind === 'experiment' ? 'experiment' : 'todo';
}

export function promotionTodoText(kind: Exclude<PromotionKind, 'experiment'>, title: string) {
  switch (kind) {
    case 'belief_update':
      return `Belief update: ${title}`;
    case 'literature_task':
      return `Literature task: ${title}`;
    case 'clean_result_question':
      return `Clean-result question: ${title}`;
  }
}
