'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function DashboardLiveRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const events = new EventSource('/api/pipeline/events');
    let refreshScheduled = false;

    function scheduleRefresh() {
      if (refreshScheduled) return;
      refreshScheduled = true;
      window.setTimeout(() => {
        refreshScheduled = false;
        startTransition(() => router.refresh());
      }, 200);
    }

    events.addEventListener('changed', scheduleRefresh);
    return () => events.close();
  }, [router, startTransition]);

  return null;
}
