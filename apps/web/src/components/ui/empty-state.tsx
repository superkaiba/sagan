import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-[--radius-panel] border border-dashed border-[--color-border] bg-[--color-surface-subtle] px-5 py-8 text-center shadow-[var(--shadow-inset)]',
        className,
      )}
    >
      {icon ? <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[--radius-control] bg-[--color-panel] text-[--color-muted] shadow-[var(--shadow-inset)]">{icon}</div> : null}
      <h2 className="text-base font-bold tracking-[-0.015em]">{title}</h2>
      <p className="mx-auto mt-1 max-w-[34rem] text-sm leading-6 text-[--color-muted]">{message}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
