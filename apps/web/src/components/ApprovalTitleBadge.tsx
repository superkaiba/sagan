'use client';

/**
 * Prepends "(N) " to document.title whenever there are owner approvals
 * waiting. Mounted once in the app shell. Refetches the count on each
 * SSE `changed` tick (no fixed polling loop) and reapplies the badge on
 * focus / visibility change so it survives route swaps.
 */
import { useEffect, useRef } from 'react';
import { useDashboardLiveSignal } from '@/lib/use-dashboard-live-signal';

const BADGE_RE = /^\(\d+\)\s+/;

export function ApprovalTitleBadge({ initialCount }: { initialCount: number }) {
  const countRef = useRef(initialCount);

  const applyBadge = () => {
    if (typeof document === 'undefined') return;
    const stripped = document.title.replace(BADGE_RE, '');
    document.title = countRef.current > 0 ? `(${countRef.current}) ${stripped}` : stripped;
  };

  const refetch = async () => {
    try {
      const res = await fetch('/api/approvals/count', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { count?: number };
      const next = typeof body.count === 'number' ? body.count : countRef.current;
      if (next !== countRef.current) countRef.current = next;
      applyBadge();
    } catch {
      // ignore — next signal will retry.
    }
  };

  useEffect(() => {
    applyBadge();
    const reapply = () => applyBadge();
    window.addEventListener('focus', reapply);
    document.addEventListener('visibilitychange', reapply);
    return () => {
      window.removeEventListener('focus', reapply);
      document.removeEventListener('visibilitychange', reapply);
      if (typeof document !== 'undefined') {
        document.title = document.title.replace(BADGE_RE, '');
      }
    };
  }, []);

  useDashboardLiveSignal(() => {
    void refetch();
  });

  return null;
}
