import { NextResponse } from 'next/server';
import { loadApprovalItems } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Lightweight endpoint used by the tab-title badge to poll the pending
 * approval count. Returns `{ count }` — no payload bodies, no entity ids.
 */
// Public read (2026-07-06): the badge count works without a session.
export async function GET() {
  const items = await loadApprovalItems(200);
  return NextResponse.json({ count: items.length });
}
