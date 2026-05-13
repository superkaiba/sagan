'use client';

import { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AnchoredCommentsProvider } from '@/components/AnchoredCommentsContext';
import { CommentableBody } from '@/components/CommentableBody';
import { Comments } from '@/components/Comments';

// Renders an experiment plan with inline anchored comments, mirroring the
// /p/[slug] reading UX. Select any text in the plan to leave an anchored
// comment; the Revise button re-dispatches the planner with every unresolved
// comment attached to the current plan version so Claude can address them in
// one shot. The provider is scoped here (not the page-wide one in entity
// page.tsx) so plan comments don't compete with experiment-body comments for
// the shared anchor state.
export function PlanWithComments({
  experimentId,
  planMd,
  planRunId,
  canRevise,
}: {
  experimentId: string;
  planMd: string;
  planRunId: string;
  canRevise: boolean;
}) {
  const router = useRouter();
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revise() {
    setRevising(true);
    setError(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/dispatch-planner`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? 'Revise failed.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revise failed.');
    } finally {
      setRevising(false);
    }
  }

  return (
    <AnchoredCommentsProvider>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <CommentableBody body={planMd} />
          {canRevise ? (
            <div className="mt-4 space-y-1 border-t border-[--color-border] pt-4">
              <p className="text-xs text-[--color-muted]">
                Select any text in the plan to leave an anchored comment, then click Revise to send all open comments back to Sagan.
              </p>
              <button
                type="button"
                onClick={revise}
                disabled={revising}
                className="inline-flex items-center gap-1.5 rounded-md border border-[--color-attention] bg-[--color-attention] px-3 py-2 text-sm font-medium text-[--color-attention-fg] hover:brightness-105 focus:outline-none focus:ring-2 focus:ring-[--color-focus] disabled:cursor-wait disabled:opacity-60"
              >
                {revising ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                Revise plan with comments
              </button>
              {error ? <p className="text-xs text-[--color-danger]">{error}</p> : null}
            </div>
          ) : null}
        </div>
        <Comments entityKind="experiment_plan" entityId={planRunId} />
      </div>
    </AnchoredCommentsProvider>
  );
}
