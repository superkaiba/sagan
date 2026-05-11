'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

export function RouteModal({ children }: { children: ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') router.back();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 p-3 md:p-6"
      role="presentation"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.62)' }}
      onMouseDown={() => router.back()}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-lg border border-[--color-border] shadow-lg"
        style={{
          backgroundColor: 'var(--color-bg)',
          color: 'var(--color-fg)',
          boxShadow: '0 18px 60px rgba(0, 0, 0, 0.35)',
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header
          className="flex items-center justify-end border-b border-[--color-border] px-3 py-2"
          style={{ backgroundColor: 'var(--color-muted-bg)' }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Close overlay"
            className="rounded-md border border-[--color-border] bg-[--color-bg] p-1.5 text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--color-bg)' }}>
          {children}
        </div>
      </section>
    </div>
  );
}
