'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Walks any `<aside class="toc">` blocks in the page (produced by clean-result
 * bodies) and uses IntersectionObserver to mark the TOC link whose target
 * section is most prominently in view. The CSS in the body styles
 * `[data-active="true"]` to show the highlight.
 *
 * Generic: works on any body that renders a `<aside class="toc">` with
 * anchors pointing at section ids. Doesn't care which body or kind.
 */
export function TocHighlighter() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Defer so the route's body content is mounted in the DOM.
    const setupId = window.setTimeout(() => {
      const tocs = Array.from(document.querySelectorAll('aside.toc')) as HTMLElement[];
      if (tocs.length === 0) return;

      const links = tocs.flatMap((t) => Array.from(t.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')));
      if (links.length === 0) return;

      // Map section id → link element. Filter out links whose target doesn't exist on the page.
      const sectionToLink = new Map<string, HTMLAnchorElement>();
      const sections: HTMLElement[] = [];
      for (const link of links) {
        const id = link.getAttribute('href')?.slice(1);
        if (!id) continue;
        const el = document.getElementById(id);
        if (!el) continue;
        sectionToLink.set(id, link);
        sections.push(el);
      }
      if (sections.length === 0) return;

      // Track intersection ratios; pick the section with the highest visible ratio
      // (breaking ties by document order) as the active one.
      const ratios = new Map<string, number>();
      const setActive = () => {
        let best: string | null = null;
        let bestRatio = 0;
        for (const id of sectionToLink.keys()) {
          const r = ratios.get(id) ?? 0;
          if (r > bestRatio) {
            best = id;
            bestRatio = r;
          }
        }
        for (const [id, link] of sectionToLink) {
          if (id === best) link.setAttribute('data-active', 'true');
          else link.removeAttribute('data-active');
        }
      };

      const obs = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
          }
          setActive();
        },
        {
          // Trigger near the top of the viewport so a section is "active"
          // when its heading is comfortably visible.
          rootMargin: '-80px 0px -55% 0px',
          threshold: [0, 0.25, 0.5, 0.75, 1],
        },
      );
      for (const s of sections) obs.observe(s);

      return () => obs.disconnect();
    }, 100);

    return () => window.clearTimeout(setupId);
  }, [pathname]);

  return null;
}
