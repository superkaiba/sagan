import { NextResponse } from 'next/server';
import { getMentorWeeklyUpdate } from '@/lib/mentor-results-data';

// Static snapshot — see apps/web/data/mentor-legacy-results.json. To
// refresh, run `pnpm --filter @sagan/runner snapshot-mentor` and commit.
export function GET() {
  const update = getMentorWeeklyUpdate();
  return NextResponse.json({ update, results: update.results });
}
