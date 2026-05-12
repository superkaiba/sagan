'use client';

/**
 * Prepends "(N) " to document.title whenever there are owner approvals
 * waiting. Mounted once in the app shell; polls /api/approvals/count every
 * 30s. Strips the badge prefix from the *current* title each tick so it
 * survives route changes and other components rewriting document.title.
 */
import { useEffect, useRef } from 'react';

const POLL_MS = 30_000;
const BADGE_RE = /^\(\d+\)\s+/;

export function ApprovalTitleBadge({ initialCount }: { initialCount: number }) {
  const countRef = useRef(initialCount);

  useEffect(() => {
    let cancelled = false;

    const applyBadge = () => {
      if (typeof document === 'undefined') return;
      const stripped = document.title.replace(BADGE_RE, '');
      document.title = countRef.current > 0 ? `(${countRef.current}) ${stripped}` : stripped;
    };

    const tick = async () => {
      try {
        const res = await fetch('/api/approvals/count', { cache: 'no-store' });
        if (!res.ok) return;
        const body = (await res.json()) as { count?: number };
        if (cancelled) return;
        const next = typeof body.count === 'number' ? body.count : countRef.current;
        if (next !== countRef.current) {
          countRef.current = next;
        }
        applyBadge();
      } catch {
        // ignore — try again next tick.
      }
    };

    applyBadge();
    const interval = setInterval(tick, POLL_MS);
    // Re-apply on every navigation / focus so the badge survives layout swaps.
    const reapply = () => applyBadge();
    window.addEventListener('focus', reapply);
    document.addEventListener('visibilitychange', reapply);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', reapply);
      document.removeEventListener('visibilitychange', reapply);
      if (typeof document !== 'undefined') {
        document.title = document.title.replace(BADGE_RE, '');
      }
    };
  }, []);

  return null;
}
