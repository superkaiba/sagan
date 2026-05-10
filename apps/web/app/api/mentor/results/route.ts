import { NextResponse } from 'next/server';
import { getMentorCleanResults } from '@/lib/github-mentor-results';

// 5 minute cache to keep this endpoint cheap; the underlying scrape is
// rate-limited by GitHub and rarely changes.
let cache: { at: number; results: Awaited<ReturnType<typeof getMentorCleanResults>> } | null = null;
const TTL_MS = 5 * 60_000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ results: cache.results, cached: true });
  }
  try {
    const results = await getMentorCleanResults();
    cache = { at: Date.now(), results };
    return NextResponse.json({ results, cached: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'scrape_failed' },
      { status: 502 },
    );
  }
}
