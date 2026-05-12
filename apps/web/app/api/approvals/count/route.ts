import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { loadApprovalItems } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Lightweight endpoint used by the tab-title badge to poll the pending
 * approval count. Returns `{ count }` — no payload bodies, no entity ids.
 */
export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const items = await loadApprovalItems(200);
  return NextResponse.json({ count: items.length });
}
