import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function MetricTile({
  label,
  value,
  detail,
  icon,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: 'neutral' | 'approval' | 'warning' | 'danger' | 'success' | 'info';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[--radius-panel] border bg-[--color-panel] p-4 shadow-[var(--shadow-lift)]',
        tone === 'neutral' && 'border-[--color-border]',
        tone === 'approval' && 'border-[--color-approval-border] bg-[--color-approval-bg]',
        tone === 'warning' && 'border-[--color-warning-border] bg-[--color-warning-bg]',
        tone === 'danger' && 'border-[--color-danger-border] bg-[--color-danger-bg]',
        tone === 'success' && 'border-[--color-success-border] bg-[--color-success-bg]',
        tone === 'info' && 'border-[--color-info-border] bg-[--color-info-bg]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[--color-muted]">{label}</p>
        {icon ? <div className="text-[--color-muted]">{icon}</div> : null}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-[-0.03em]">{value}</div>
      {detail ? <div className="mt-1 text-sm leading-5 text-[--color-muted]">{detail}</div> : null}
    </div>
  );
}
