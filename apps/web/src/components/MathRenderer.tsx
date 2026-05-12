'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import renderMathInElement from 'katex/contrib/auto-render';

/**
 * Walks the document after every route change and replaces LaTeX
 * delimiters with KaTeX-rendered math. Bodies write inline math as
 * \(...\) and display math as \[...\] (or $$...$$). Plain $...$ is
 * intentionally NOT a delimiter — too many false positives from prose
 * dollar signs.
 *
 * The dashboard's RichBody sanitizes HTML but leaves these text
 * delimiters untouched; the renderer picks them up post-render.
 */
export function MathRenderer() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    // Defer to next frame so the new route's body is in the DOM before we walk it.
    const id = requestAnimationFrame(() => {
      try {
        renderMathInElement(document.body, {
          delimiters: [
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '$$', right: '$$', display: true },
          ],
          throwOnError: false,
          errorColor: '#D97757', // clay — same accent as the dashboard
        });
      } catch {
        // KaTeX renders best-effort; never crash the page if a body has
        // malformed math.
      }
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return null;
}
