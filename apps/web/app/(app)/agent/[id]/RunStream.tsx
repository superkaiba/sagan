'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '@/components/Markdown';

interface RunEvent {
  id: string;
  eventType: string;
  body: string | null;
  createdAt: string;
}

interface Props {
  runId: string;
  kind: string;
  initialStatus: string;
  initialPlanMd: string | null;
  initialEvents: RunEvent[];
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected']);

export function RunStream({ runId, kind, initialStatus, initialPlanMd, initialEvents }: Props) {
  const [events, setEvents] = useState<RunEvent[]>(initialEvents);
  const [status, setStatus] = useState(initialStatus);
  const [planMd, setPlanMd] = useState<string | null>(initialPlanMd);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const seen = useRef(new Set<string>(initialEvents.map((e) => e.id)));

  useEffect(() => {
    if (TERMINAL.has(status)) return;
    const es = new EventSource(`/api/agent-runs/${runId}/events`);

    es.addEventListener('event', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as RunEvent & { createdAt: string };
      if (seen.current.has(data.id)) return;
      seen.current.add(data.id);
      setEvents((prev) => [...prev, data]);
    });
    es.addEventListener('status', (e) => {
      const data = JSON.parse((e as MessageEvent).data) as {
        status: string;
        planMd: string | null;
        lastError: string | null;
      };
      setStatus(data.status);
      if (data.planMd) setPlanMd(data.planMd);
      if (data.lastError) setError(data.lastError);
    });
    es.addEventListener('done', () => {
      es.close();
      router.refresh();
    });
    es.addEventListener('error', () => {
      es.close();
    });

    return () => es.close();
  }, [runId, status, router]);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agent-runs/${runId}/${decision}`, { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? `${decision}_failed`);
      } else {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const showApproval = status === 'awaiting_approval' && (kind === 'plan' || kind === 'experiment');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-[--color-border] bg-[--color-muted-bg] px-4 py-3">
        <span className="text-xs uppercase tracking-wide text-[--color-muted]">Status</span>
        <span className="font-mono text-sm">{status}</span>
        <span className="ml-auto text-xs text-[--color-muted]">{events.length} event{events.length === 1 ? '' : 's'}</span>
      </div>

      {error ? (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-[--color-danger] bg-[oklch(0.99_0.02_25)] p-4 text-sm text-[--color-danger]">
          {error}
        </pre>
      ) : null}

      {planMd ? (
        <section className="rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-4">
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-[--color-muted]">
            Plan
          </h2>
          <Markdown>{planMd}</Markdown>
          {showApproval ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('approve')}
                className="rounded-md bg-[--color-accent] px-4 py-2 text-sm font-medium text-[--color-accent-fg] disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => decide('reject')}
                className="rounded-md border border-[--color-border] px-4 py-2 text-sm font-medium hover:border-[--color-fg] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-1">
        <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">
          Events
        </h2>
        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-[--color-border] divide-y divide-[--color-border] font-mono text-xs">
          {events.length === 0 ? (
            <p className="p-3 text-[--color-muted]">No events yet.</p>
          ) : (
            events.map((ev) => (
              <div key={ev.id} className="p-3">
                <div className="flex items-baseline gap-3 text-[--color-muted]">
                  <span>{new Date(ev.createdAt).toLocaleTimeString()}</span>
                  <span className="text-[--color-fg]">{ev.eventType}</span>
                </div>
                {ev.body ? (
                  <pre className="mt-1 whitespace-pre-wrap break-words text-[--color-fg]">{ev.body}</pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
