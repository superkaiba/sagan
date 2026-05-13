'use client';

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DispatchPlannerButton } from '@/components/DispatchPlannerButton';
import { cn } from '@/lib/cn';
import { parseClarifyingQuestions, type ClarifyingQuestion } from '@/lib/clarifying-questions';

type Mode = 'active' | 'pending' | 'feedback' | 'readonly';

const MODE_LABELS: Record<Mode, { title: string; intro: string; dispatchLabel: string; canDispatch: boolean }> = {
  active: {
    title: 'Clarifying questions',
    intro:
      'Sagan paused to ask the questions below. Answer each one in its textbox, then dispatch the planner — it will read your answers and either ask follow-ups or move on to drafting a plan.',
    dispatchLabel: 'Dispatch planner with answers',
    canDispatch: true,
  },
  pending: {
    title: 'Clarifying questions',
    intro:
      'Sagan is reading your answers and deciding whether to ask more questions or draft a plan. Your answers stay editable; dispatch is paused until Claude returns.',
    dispatchLabel: 'Dispatch planner with answers',
    canDispatch: false,
  },
  feedback: {
    title: 'Plan awaiting approval',
    intro:
      'Sagan drafted a plan and is waiting for approval. Approve from the dashboard, or note any feedback in the textboxes below and re-dispatch the planner.',
    dispatchLabel: 'Re-dispatch planner with feedback',
    canDispatch: true,
  },
  readonly: {
    title: 'Clarifying questions (history)',
    intro: 'The most recent clarifying-questions round and the answers you gave.',
    dispatchLabel: 'Dispatch planner',
    canDispatch: false,
  },
};

const PROSE = [
  'prose prose-sm max-w-none',
  '[&_p]:my-1.5 [&_p]:leading-relaxed',
  '[&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5',
  '[&_strong]:font-semibold',
  '[&_code]:bg-[--color-muted-bg] [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded',
].join(' ');

export function ClarifyingQuestionsForm({
  experimentId,
  body,
  initialAnswers,
  mode,
  canDispatch,
}: {
  experimentId: string;
  body: string;
  initialAnswers: Record<string, string>;
  mode: Mode;
  canDispatch: boolean;
}) {
  const router = useRouter();
  const questions: ClarifyingQuestion[] = useMemo(() => parseClarifyingQuestions(body), [body]);
  const config = MODE_LABELS[mode];

  if (questions.length === 0) return null;

  const showDispatch = canDispatch && config.canDispatch;

  return (
    <section className="rounded-lg border border-[--color-warning-border] bg-[--color-warning-bg] p-4">
      <header className="mb-3 space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[--color-warning]">
          {config.title}
        </h2>
        <p className="text-xs text-[--color-muted]">{config.intro}</p>
      </header>

      <ol className="space-y-3">
        {questions.map((q) => (
          <QuestionItem
            key={q.index}
            experimentId={experimentId}
            question={q}
            initialAnswer={initialAnswers[String(q.index)] ?? ''}
            disabled={!canDispatch || mode === 'pending'}
          />
        ))}
      </ol>

      {showDispatch ? (
        <div className="mt-3">
          <DispatchPlannerButton
            experimentId={experimentId}
            label={config.dispatchLabel}
            onDispatched={() => router.refresh()}
          />
        </div>
      ) : null}
    </section>
  );
}

function QuestionItem({
  experimentId,
  question,
  initialAnswer,
  disabled,
}: {
  experimentId: string;
  question: ClarifyingQuestion;
  initialAnswer: string;
  disabled: boolean;
}) {
  const [value, setValue] = useState(initialAnswer);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const lastSavedRef = useRef(initialAnswer);

  async function save(next: string) {
    if (next === lastSavedRef.current) return;
    setState('saving');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/experiments/${experimentId}/clarification-answers`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ index: question.index, answer: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      lastSavedRef.current = next;
      setState('saved');
    } catch (err) {
      setState('error');
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <li className="rounded-md border border-[--color-border] bg-[--color-bg] p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-mono text-[--color-muted]">{question.index}.</span>
        <h3 className="text-sm font-semibold leading-snug">{question.heading}</h3>
      </div>
      {question.detail ? (
        <div className={cn('mt-1.5 text-xs text-[--color-muted]', PROSE)}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{question.detail}</ReactMarkdown>
        </div>
      ) : null}
      <div className="mt-2 space-y-1">
        <textarea
          value={value}
          disabled={disabled}
          rows={Math.max(3, Math.min(12, value.split('\n').length + 1))}
          placeholder="Your answer…"
          onChange={(event) => {
            setValue(event.target.value);
            if (state === 'saved' || state === 'error') setState('idle');
          }}
          onBlur={() => {
            if (!disabled) void save(value);
          }}
          className={cn(
            'w-full rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-focus]',
            disabled && 'cursor-not-allowed opacity-70',
          )}
        />
        <div className="flex h-4 items-center justify-end gap-1.5 text-[10px] text-[--color-muted]">
          {state === 'saving' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              <span>Saving…</span>
            </>
          ) : state === 'saved' ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-[--color-success]" aria-hidden="true" />
              <span>Saved</span>
            </>
          ) : state === 'error' ? (
            <span className="text-[--color-danger]">{errorMsg ?? 'Save failed'}</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
