export interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Walks an HTML string, injects `id` attributes onto every <h2> and <h3> that
 * doesn't already have one, and returns the rewritten HTML plus a flat list
 * of (id, text, level) tuples for rendering a table of contents.
 *
 * Slugs are derived from heading text, de-duplicated by suffixing -2, -3, etc.
 * For markdown bodies (no <h2>/<h3> tags), returns the input unchanged with
 * an empty toc.
 */
export function extractTocAndAddIds(html: string): {
  processed: string;
  toc: TocEntry[];
} {
  const headings: TocEntry[] = [];
  const seen = new Set<string>();

  const slugify = (s: string): string => {
    return s
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'section';
  };

  const processed = html.replace(
    /<(h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi,
    (full, tag: string, attrs: string, content: string) => {
      const level = (tag === 'h2' ? 2 : 3) as 2 | 3;
      const idMatch = attrs.match(/\bid="([^"]+)"/);
      if (idMatch && idMatch[1]) {
        headings.push({ id: idMatch[1], text: stripTags(content).trim(), level });
        return full;
      }
      let base = slugify(content);
      let slug = base;
      let n = 1;
      while (seen.has(slug)) {
        n += 1;
        slug = `${base}-${n}`;
      }
      seen.add(slug);
      headings.push({ id: slug, text: stripTags(content).trim(), level });
      return `<${tag}${attrs} id="${slug}">${content}</${tag}>`;
    },
  );

  return { processed, toc: headings };
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '');
}
