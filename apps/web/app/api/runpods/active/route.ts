import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/access';
import { loadActiveRunPods } from '@/lib/dashboard';
import { loadRunPodAccountSummaries } from '@/lib/runpod-api';

export async function GET() {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }

  const [pods, accounts] = await Promise.all([loadActiveRunPods(40), loadRunPodAccountSummaries()]);
  return NextResponse.json({ pods, accounts, generatedAt: new Date().toISOString() });
}
