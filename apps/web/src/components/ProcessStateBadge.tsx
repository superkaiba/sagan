import { cn } from '@/lib/cn';
import type { ProcessState, ProcessStateTone } from '@/lib/process-state';

const TONE_CLASS: Record<ProcessStateTone, string> = {
  neutral: 'border-[--color-border] bg-[--color-muted-bg] text-[--color-muted]',
  info: 'border-[--color-info-border] bg-[--color-info-bg] text-[--color-info]',
  running: 'border-[--color-running-border] bg-[--color-running-bg] text-[--color-running]',
  approval: 'border-[--color-attention] bg-[--color-attention-soft] text-[--color-attention]',
  warning: 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]',
  danger: 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]',
  success: 'border-[--color-success-border] bg-[--color-success-bg] text-[--color-success]',
};

export function ProcessStateBadge({
  state,
  compact = false,
}: {
  state: ProcessState;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 border font-medium',
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs',
        TONE_CLASS[state.tone],
      )}
      title={state.detail ?? state.label}
    >
      <span className="truncate">{state.label}</span>
      {state.detail && !compact ? <span className="font-mono opacity-75">{state.detail}</span> : null}
    </span>
  );
}
