/**
 * Static snapshot of the mentor's "useful" results from the legacy GitHub
 * project board. Frozen so the runtime dashboard never has to hit GitHub.
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

export function getMentorCleanResults(): CleanResult[] {
  return (data.results as CleanResult[]).slice().sort(
    (a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime(),
  );
}
