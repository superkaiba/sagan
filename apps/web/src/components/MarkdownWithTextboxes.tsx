'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Markdown } from './Markdown';

/**
 * Render markdown with inline `[TEXTBOX]` tokens replaced by auto-saving
 * textareas. The LLM (planner / clarifier) inserts `[TEXTBOX]` wherever it
 * wants the owner to answer; the rendered UI replaces each occurrence with
 * a real textarea, indexed by position in document order.
 *
 * Answers persist via `PATCH /api/textbox-answers/<entityKind>/<entityId>`
 * (workflow_events row, marker_type='epm:textbox-answers'). Initial values
 * load via GET on mount.
 *
 * Tokens supported:
 *   - `[TEXTBOX]`            — anonymous, numbered by position
 *   - `[TEXTBOX:label]`      — `label` is used as the textbox's identifier and
 *     also shown as a placeholder so the LLM can hint what answer it wants.
 *
 * Markdown segments between tokens are passed through to the existing
 * Markdown renderer untouched.
 */
const TEXTBOX_RE = /\[TEXTBOX(?::([^\]]+))?\]/g;

interface Segment {
  type: 'markdown' | 'textbox';
  body: string;
  /** Stable id used as the answers-map key. */
  id: string;
  /** Optional human-readable hint from `[TEXTBOX:label]`. */
  label?: string;
}

function tokenize(body: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  let positionalIndex = 0;
  for (const match of body.matchAll(TEXTBOX_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      segments.push({ type: 'markdown', body: body.slice(cursor, start), id: '' });
    }
    positionalIndex += 1;
    const label = match[1]?.trim();
    segments.push({
      type: 'textbox',
      body: '',
      id: label && label.length > 0 ? label : String(positionalIndex),
      label: label && label.length > 0 ? label : undefined,
    });
    cursor = start + match[0].length;
  }
  if (cursor < body.length) {
    segments.push({ type: 'markdown', body: body.slice(cursor), id: '' });
  }
  return segments;
}

export function MarkdownWithTextboxes({
  body,
  entityKind,
  entityId,
  source = 'plan',
  className,
}: {
  body: string;
  entityKind: 'experiment' | 'todo';
  entityId: string;
  source?: 'plan' | 'clarification';
  className?: string;
}) {
  const segments = useMemo(() => tokenize(body), [body]);
  const hasTextboxes = useMemo(() => segments.some((s) => s.type === 'textbox'), [segments]);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!hasTextboxes) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void fetch(`/api/textbox-answers/${entityKind}/${entityId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: { answers?: Record<string, string> }) => {
        if (cancelled) return;
        setAnswers(data.answers ?? {});
      })
      .catch(() => {
        // Best effort — leave answers empty so the user can still type.
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entityKind, entityId, hasTextboxes]);

  async function save(nextAnswers: Record<string, string>) {
    await fetch(`/api/textbox-answers/${entityKind}/${entityId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, answers: nextAnswers }),
    });
  }

  if (!hasTextboxes) return <Markdown className={className}>{body}</Markdown>;

  return (
    <div className={className}>
      {segments.map((segment, i) => {
        if (segment.type === 'markdown') {
          return <Markdown key={`md-${i}`}>{segment.body}</Markdown>;
        }
        return (
          <TextboxField
            key={`tb-${segment.id}-${i}`}
            id={segment.id}
            label={segment.label}
            value={answers[segment.id] ?? ''}
            disabled={!loaded}
            onCommit={async (next) => {
              const merged = { ...answers, [segment.id]: next };
              setAnswers(merged);
              await save(merged);
            }}
          />
        );
      })}
    </div>
  );
}

function TextboxField({
  id,
  label,
  value,
  disabled,
  onCommit,
}: {
  id: string;
  label?: string;
  value: string;
  disabled: boolean;
  onCommit: (next: string) => Promise<void>;
}) {
  const [local, setLocal] = useState(value);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedRef = useRef(value);

  useEffect(() => {
    setLocal(value);
    lastSavedRef.current = value;
  }, [value]);

  async function commit() {
    if (local === lastSavedRef.current) return;
    setState('saving');
    try {
      await onCommit(local);
      lastSavedRef.current = local;
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <div className="my-3 rounded-md border border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_5%,transparent)] p-2">
      <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-[--color-muted]">
        <span>Your answer{label ? `: ${label}` : ` #${id}`}</span>
        <span className="flex items-center gap-1">
          {state === 'saving' ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : state === 'saved' ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-[--color-success]" aria-hidden="true" />
              Saved
            </>
          ) : state === 'error' ? (
            <span className="text-[--color-danger]">Save failed — retry on blur</span>
          ) : null}
        </span>
      </div>
      <textarea
        value={local}
        disabled={disabled}
        rows={Math.max(2, Math.min(10, local.split('\n').length + 1))}
        placeholder={label ? `Answer: ${label}` : 'Type your answer here…'}
        onChange={(e) => {
          setLocal(e.target.value);
          if (state === 'saved' || state === 'error') setState('idle');
        }}
        onBlur={() => void commit()}
        className="w-full rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-focus] disabled:cursor-not-allowed disabled:opacity-70"
      />
    </div>
  );
}
