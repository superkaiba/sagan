'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApprovalAction } from '@/lib/dashboard';
import { Button } from '@/components/ui';

export function ApprovalActionButtons({ action }: { action: ApprovalAction }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function request(label: string, url: string, init: RequestInit) {
    setBusy(label);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `${label}_failed`);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function setExperimentStatus(status: 'approved' | 'planning' | 'blocked') {
    await request(status, `/api/experiments/${action.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        status,
        note:
          status === 'approved'
            ? 'Owner approved from the global approval inbox.'
            : status === 'planning'
              ? 'Owner deferred from the global approval inbox.'
              : 'Owner marked this blocked from the global approval inbox.',
      }),
    });
  }

  async function setCleanResultStatus(status: 'approved' | 'reviewing' | 'blocked') {
    await request(status, `/api/clean-results/${action.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  }

  async function decideAgent(decision: 'approve' | 'reject') {
    await request(decision, `/api/agent-runs/${action.id}/${decision}`, { method: 'POST' });
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        {action.kind === 'experiment' ? (
          <>
            <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => setExperimentStatus('approved')}>
              {busy === 'approved' ? 'Working' : 'Approve'}
            </Button>
            <Button size="sm" disabled={Boolean(busy)} onClick={() => setExperimentStatus('planning')}>
              Defer
            </Button>
            <Button size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => setExperimentStatus('blocked')}>
              Block
            </Button>
          </>
        ) : null}

        {action.kind === 'clean_result' ? (
          <>
            {action.status === 'blocked' ? (
              <Button size="sm" disabled={Boolean(busy)} onClick={() => setCleanResultStatus('reviewing')}>
                Reopen
              </Button>
            ) : (
              <>
                <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => setCleanResultStatus('approved')}>
                  {busy === 'approved' ? 'Working' : 'Approve'}
                </Button>
                <Button size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => setCleanResultStatus('blocked')}>
                  Block
                </Button>
              </>
            )}
          </>
        ) : null}

        {action.kind === 'agent_run' ? (
          <>
            <Button size="sm" variant="primary" disabled={Boolean(busy)} onClick={() => decideAgent('approve')}>
              {busy === 'approve' ? 'Working' : 'Approve'}
            </Button>
            <Button size="sm" variant="danger" disabled={Boolean(busy)} onClick={() => decideAgent('reject')}>
              Reject
            </Button>
          </>
        ) : null}
      </div>
      {error ? <p className="text-right text-xs text-[--color-danger]">{error}</p> : null}
    </div>
  );
}
