import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/auth';
import { loadApprovalItems } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

/**
 * Mobile + dashboard list endpoint. Returns the full approval queue (decision /
 * blocked / review) so the mobile app can render action buttons. The
 * dashboard renders this via a server component using loadApprovalItems
 * directly, which is why this HTTP wrapper didn't exist until now.
 */
export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const items = await loadApprovalItems(200);
  return NextResponse.json({ items });
}
