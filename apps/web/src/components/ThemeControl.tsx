'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type ThemeChoice = 'light' | 'system' | 'dark';

const STORAGE_KEY = 'sagan-theme';
const OPTIONS: Array<{ value: ThemeChoice; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
];

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.dataset.theme = choice;
  }
}

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setChoice(next);
    applyTheme(next);
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <fieldset className={cn('space-y-1', compact && 'min-w-max')}>
      <legend className="sr-only">Theme</legend>
      <div className="flex rounded-[--radius-control] border border-[--color-border] bg-[--color-bg] p-0.5 shadow-[var(--shadow-inset)]">
        {OPTIONS.map((option) => {
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(option.value)}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-2 py-1 text-xs font-medium text-[--color-muted]',
                'hover:bg-[--color-hover] hover:text-[--color-fg]',
                active && 'bg-[--color-panel] font-semibold text-[--color-fg] shadow-[var(--shadow-inset)]',
                compact && 'px-1.5 text-[11px]',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
