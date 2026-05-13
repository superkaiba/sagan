'use client';

import { useEffect, useRef } from 'react';

type Listener = () => void;

// One EventSource shared across every subscriber on the page. Without this
// each polled component would open its own connection, and the browser caps
// EventSource at 6 per origin (HTTP/1.1) — a single experiment page used to
// blow through that just from Comments + Followups + Improve + Review.
let source: EventSource | null = null;
let refCount = 0;
const listeners = new Set<Listener>();

function ensureSource() {
  if (source) return;
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  const es = new EventSource('/api/pipeline/events');
  es.addEventListener('changed', () => {
    listeners.forEach((l) => {
      try {
        l();
      } catch {
        // a misbehaving subscriber must not break the others
      }
    });
  });
  source = es;
}

function closeIfIdle() {
  if (refCount > 0) return;
  source?.close();
  source = null;
}

/**
 * Subscribe to the dashboard's SSE channel. `onChange` is invoked (debounced
 * 200ms) whenever the server signals that any pipeline-relevant table has new
 * activity, and once when the tab returns from being hidden (so we recover
 * from any events the browser throttled while in the background).
 *
 * The hook does not fire on mount — components are expected to do their own
 * initial fetch in a separate effect.
 */
export function useDashboardLiveSignal(onChange: () => void) {
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    let scheduled = false;
    function fire() {
      if (scheduled) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        handlerRef.current();
      }, 200);
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') fire();
    }

    listeners.add(fire);
    refCount += 1;
    ensureSource();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      listeners.delete(fire);
      refCount -= 1;
      document.removeEventListener('visibilitychange', onVisibility);
      closeIfIdle();
    };
  }, []);
}
