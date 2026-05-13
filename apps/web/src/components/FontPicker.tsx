'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

type FontChoice =
  | 'geist'
  | 'inter-tight'
  | 'bricolage'
  | 'outfit'
  | 'manrope'
  | 'space-grotesk'
  | 'dm-sans'
  | 'ibm-plex'
  | 'source-serif'
  | 'newsreader';

const STORAGE_KEY = 'sagan-font';

const OPTIONS: Array<{ value: FontChoice; label: string; sample: string }> = [
  { value: 'geist',          label: 'Geist',             sample: 'Vercel default · modern minimalist' },
  { value: 'inter-tight',    label: 'Inter Tight',       sample: 'Tighter Inter · Linear / Stripe' },
  { value: 'bricolage',      label: 'Bricolage Grotesque', sample: 'Distinctive · editorial' },
  { value: 'outfit',         label: 'Outfit',            sample: 'Geometric · friendly' },
  { value: 'manrope',        label: 'Manrope',           sample: 'Humanist · balanced' },
  { value: 'space-grotesk',  label: 'Space Grotesk',     sample: 'Architectural · sci-fi' },
  { value: 'dm-sans',        label: 'DM Sans',           sample: 'Clean · neutral' },
  { value: 'ibm-plex',       label: 'IBM Plex Sans',     sample: 'Corporate · engineering' },
  { value: 'source-serif',   label: 'Source Serif 4',    sample: 'Modern serif · editorial' },
  { value: 'newsreader',     label: 'Newsreader',        sample: 'Serif · long-form / journal' },
];

const FONT_VAR: Record<FontChoice, string> = {
  geist: 'var(--font-geist-sans)',
  'inter-tight': 'var(--font-inter-tight)',
  bricolage: 'var(--font-bricolage)',
  outfit: 'var(--font-outfit)',
  manrope: 'var(--font-manrope)',
  'space-grotesk': 'var(--font-space-grotesk)',
  'dm-sans': 'var(--font-dm-sans)',
  'ibm-plex': 'var(--font-ibm-plex)',
  'source-serif': 'var(--font-source-serif)',
  newsreader: 'var(--font-newsreader)',
};

function applyFont(choice: FontChoice) {
  document.documentElement.dataset.font = choice;
}

export function FontPicker() {
  const [choice, setChoice] = useState<FontChoice>('geist');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in FONT_VAR) {
      setChoice(stored as FontChoice);
      applyFont(stored as FontChoice);
    }
  }, []);

  function pick(next: FontChoice) {
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyFont(next);
  }

  const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[0]!;

  return (
    <fieldset className="relative space-y-1">
      <legend className="sr-only">Font</legend>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between rounded-[--radius-control] border border-[--color-border]',
          'bg-[var(--color-panel)] px-2.5 py-1.5 text-left text-xs text-[--color-fg] shadow-[var(--shadow-inset)]',
          'hover:bg-[--color-hover]',
        )}
        style={{ backgroundColor: 'var(--color-panel)' }}
      >
        <span className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-wide text-[--color-muted]">Font</span>
          <span className="font-semibold">{current.label}</span>
        </span>
        <span aria-hidden="true" className="text-[--color-muted]">{open ? '▾' : '▸'}</span>
      </button>
      {open ? (
        <>
          {/* Click-outside catcher */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          {/* Popover: anchored to the picker, opens upward, internal scroll */}
          <ul
            role="listbox"
            aria-label="Choose dashboard font"
            className={cn(
              'absolute bottom-full left-0 z-50 mb-1 w-full',
              'max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain',
              'rounded-[--radius-control] border border-[--color-border]',
              'bg-[var(--color-panel)] py-1 shadow-[var(--shadow-panel)]',
            )}
            style={{ backgroundColor: 'var(--color-panel)' }}
          >
            {OPTIONS.map((option) => {
              const active = choice === option.value;
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      pick(option.value);
                      setOpen(false);
                    }}
                    style={{
                      fontFamily: FONT_VAR[option.value],
                      backgroundColor: active ? 'var(--color-muted-bg)' : undefined,
                    }}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-sm',
                      'hover:bg-[--color-hover]',
                      active && 'bg-[var(--color-muted-bg)]',
                    )}
                  >
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate font-semibold">{option.label}</span>
                      <span className="truncate text-[10px] text-[--color-muted]">{option.sample}</span>
                    </span>
                    {active ? (
                      <span aria-hidden="true" className="text-[--color-accent]">●</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </fieldset>
  );
}
