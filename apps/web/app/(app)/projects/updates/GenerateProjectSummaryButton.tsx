'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

export function GenerateProjectSummaryButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function generate() {
    if (pending) return;
    setPending(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/summary-log`, { method: 'POST' });
      const data = (await res.json().catch(() => ({}))) as { error?: string; narrativeId?: string };
      if (!res.ok) {
        setNotice(data.error ?? 'Summary failed.');
        return;
      }
      setNotice('Summary added to the log.');
      startTransition(() => router.refresh());
    } catch {
      setNotice('Summary failed.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={pending}
        className="inline-flex min-h-9 items-center gap-2 border border-[--color-accent] bg-[--color-accent] px-3 text-sm font-semibold text-[--color-accent-fg] hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
        AI summarize
      </button>
      {notice ? <span className="text-xs text-[--color-muted]">{notice}</span> : null}
    </div>
  );
}
