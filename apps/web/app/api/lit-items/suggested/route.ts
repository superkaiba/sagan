import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { loadTopSuggestedLitItem } from '@/lib/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const suggestion = await loadTopSuggestedLitItem();
  return NextResponse.json({ suggestion });
}
