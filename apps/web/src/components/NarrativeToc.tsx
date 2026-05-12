import type { TocEntry } from '@/lib/narrative-toc';

/**
 * Sticky left-rail table of contents for a project narrative. Plain anchor
 * links — browser handles smooth-scroll if the user has scroll-behavior:smooth
 * set globally; otherwise hash navigation works in every browser.
 */
export function NarrativeToc({ toc }: { toc: TocEntry[] }) {
  if (toc.length === 0) return null;
  return (
    <nav aria-label="Contents" className="space-y-1 text-sm">
      <p className="text-xs uppercase tracking-wide text-[--color-muted] mb-3">Contents</p>
      <ul className="space-y-1">
        {toc.map((entry) => (
          <li key={entry.id} className={entry.level === 3 ? 'pl-3' : ''}>
            <a
              href={`#${entry.id}`}
              className={
                entry.level === 2
                  ? 'block py-1 text-[--color-text] hover:text-[--color-accent] no-underline'
                  : 'block py-0.5 text-[--color-muted] hover:text-[--color-accent] no-underline text-xs'
              }
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
