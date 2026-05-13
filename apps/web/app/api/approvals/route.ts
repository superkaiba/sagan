import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/access';
import { loadApprovalItems } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Mobile + dashboard list endpoint. Returns the full approval queue (decision /
 * blocked / review) so the mobile app can render action buttons. Owner-only
 * because every action exposed on each item (PATCH experiments, PATCH
 * clean-results, POST agent-runs/approve|reject) is itself owner-gated —
 * showing the queue to a non-owner would render buttons that all 403.
 */
export async function GET() {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  const items = await loadApprovalItems(200);
  return NextResponse.json({ items });
}
