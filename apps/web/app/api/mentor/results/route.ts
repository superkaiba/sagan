import { NextResponse } from 'next/server';
import { getMentorCleanResults } from '@/lib/mentor-results-data';

// Static snapshot — see apps/web/data/mentor-legacy-results.json. To
// refresh, run `pnpm --filter @eps/runner snapshot-mentor` and commit.
export function GET() {
  return NextResponse.json({ results: getMentorCleanResults() });
}
