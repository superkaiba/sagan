import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/access';
import { loadHealthSummary } from '@/lib/health';

export async function GET() {
  try {
    await requireOwner();
  } catch {
    return NextResponse.json({ error: 'owner_required' }, { status: 403 });
  }
  return NextResponse.json(await loadHealthSummary());
}
