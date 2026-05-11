import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  Clock3,
  HelpCircle,
  Loader2,
  PauseCircle,
  Send,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { statusLabel, statusTone, type StatusTone } from '@/lib/status';

const toneClass: Record<StatusTone, string> = {
  approval: 'border-[--color-approval-border] bg-[--color-approval-bg] text-[--color-approval]',
  warning: 'border-[--color-warning-border] bg-[--color-warning-bg] text-[--color-warning]',
  danger: 'border-[--color-danger-border] bg-[--color-danger-bg] text-[--color-danger]',
  running: 'border-[--color-running-border] bg-[--color-running-bg] text-[--color-running]',
  success: 'border-[--color-success-border] bg-[--color-success-bg] text-[--color-success]',
  info: 'border-[--color-info-border] bg-[--color-info-bg] text-[--color-info]',
  neutral: 'border-[--color-border] bg-[--color-muted-bg] text-[--color-muted]',
};

function StatusIcon({ tone, status }: { tone: StatusTone; status: string }) {
  const normalized = status.toLowerCase();
  if (tone === 'approval') return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'danger') return <Ban className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'running') return <Loader2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'success') return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (tone === 'warning') return <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (normalized.includes('shared') || normalized.includes('sent')) return <Send className="h-3.5 w-3.5" aria-hidden="true" />;
  if (normalized.includes('paused') || normalized.includes('defer')) return <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  if (!status) return <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />;
  return <Circle className="h-3.5 w-3.5" aria-hidden="true" />;
}

export function StatusBadge({
  status,
  label,
  tone,
  className,
}: {
  status: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const resolvedTone = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        'inline-flex min-h-7 items-center gap-1.5 rounded-[--radius-control] border px-2 py-0.5 text-xs font-semibold leading-none shadow-[var(--shadow-inset)]',
        toneClass[resolvedTone],
        className,
      )}
    >
      <StatusIcon tone={resolvedTone} status={status} />
      <span>{label ?? statusLabel(status)}</span>
    </span>
  );
}
