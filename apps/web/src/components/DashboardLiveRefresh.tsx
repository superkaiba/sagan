'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardLiveSignal } from '@/lib/use-dashboard-live-signal';

export function DashboardLiveRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useDashboardLiveSignal(() => {
    startTransition(() => router.refresh());
  });

  return null;
}
