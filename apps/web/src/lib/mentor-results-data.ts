/**
 * Static snapshot of the mentor's weekly "Useful" update from the legacy
 * GitHub project board. Frozen so the runtime dashboard never has to hit
 * GitHub.
 *
 * To refresh after the user resumes board work and wants to publish new
 * results to the mentor, run:
 *
 *   pnpm --filter @sagan/runner snapshot-mentor
 *
 * which overwrites apps/web/data/mentor-legacy-results.json. Then commit.
 */
import data from '../../data/mentor-legacy-results.json' with { type: 'json' };

export type Confidence = 'HIGH' | 'MODERATE' | 'LOW' | null;

export interface CleanResult {
  id: string;
  number: number;
  title: string;
  body: string;
  excerpt: string;
  confidence: Confidence;
  useful: boolean;
  statusName: 'Useful' | 'Not useful';
  createdAt: string;
  doneAt: string;
  url: string;
}

export interface MentorWeeklyUpdate {
  title: string;
  sourceRepo: string;
  sourceProjectUrl: string;
  sourceColumn: 'Useful';
  generatedAt: string | null;
  issueCount: number;
  results: CleanResult[];
}

type MentorSnapshot = {
  weeklyUpdate?: {
    title?: string;
    sourceRepo?: string;
    sourceProjectUrl?: string;
    sourceColumn?: string;
    generatedAt?: string;
    issueCount?: number;
  };
  results?: CleanResult[];
};

const snapshot = data as MentorSnapshot;

export function getMentorCleanResults(): CleanResult[] {
  return (snapshot.results ?? [])
    .filter((result) => result.useful || result.statusName === 'Useful')
    .slice()
    .sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
}

export function getMentorWeeklyUpdate(): MentorWeeklyUpdate {
  const results = getMentorCleanResults();
  const meta = snapshot.weeklyUpdate;
  return {
    title: meta?.title ?? 'Weekly update',
    sourceRepo: meta?.sourceRepo ?? 'superkaiba/explore-persona-space',
    sourceProjectUrl: meta?.sourceProjectUrl ?? 'https://github.com/users/superkaiba/projects/1',
    sourceColumn: 'Useful',
    generatedAt: meta?.generatedAt ?? null,
    issueCount: results.length,
    results,
  };
}

export function getMentorCleanResultById(id: string): CleanResult | null {
  return getMentorCleanResults().find((result) => result.id === id) ?? null;
}

export function isMentorCleanResultId(id: string): boolean {
  return Boolean(getMentorCleanResultById(id));
}
