import sanitizeHtml from 'sanitize-html';
import katex from 'katex';
import { cn } from '@/lib/cn';
import { Markdown } from './Markdown';

/**
 * Replace LaTeX delimiters in body text with KaTeX-rendered HTML.
 * Process display delimiters before inline so `$$` doesn't get partially
 * consumed by `$...$` (we don't use single-dollar at all to avoid prose
 * collisions, but defensive ordering is cheap).
 *
 * Output is HTML-only (no MathML) so the sanitizer's allow-list doesn't
 * need to grow to admit <math>/<mrow>/<mi>.
 */
function renderMathDelimiters(input: string): string {
  const render = (tex: string, displayMode: boolean): string => {
    try {
      return katex.renderToString(tex.trim(), {
        displayMode,
        throwOnError: false,
        errorColor: '#D97757',
        output: 'html',
      });
    } catch {
      return tex; // Fall back to raw text on render failure.
    }
  };

  let s = input;
  // \[ ... \] — display
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex) => render(tex, true));
  // $$ ... $$ — display
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => render(tex, true));
  // \( ... \) — inline
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_m, tex) => render(tex, false));
  return s;
}

/**
 * Detect whether a body string is intended as HTML.
 *
 * Heuristic: trim whitespace; if the first non-whitespace char is `<` AND
 * the value contains any closing tag like `</…>`, treat as HTML. This catches
 * real HTML documents (`<!DOCTYPE>`, `<html>`, `<div>...</div>`) and HTML
 * fragments while not misclassifying markdown that incidentally starts with
 * a `<` character (rare; e.g. a quoted angle bracket).
 */
export function looksLikeHtml(body: string): boolean {
  const trimmed = body.trimStart();
  if (!trimmed.startsWith('<')) return false;
  return /<\/[a-z][a-z0-9]*\s*>/i.test(trimmed) || /<!doctype\s+html/i.test(trimmed);
}

/**
 * Allow-list of tags + attributes we accept from agent-generated HTML
 * bodies. Errs toward expressive: tables, figures, svg, details/summary
 * (for collapsible "Background" sections), inline images, links. Refuses
 * `<script>` and event-handler attributes — those would be a clear XSS
 * vector since the body renders in the owner's authenticated context.
 *
 * Style attributes are allowed so the agent can lay out figures, set
 * grid layouts, color blocks, etc. The CSS sanitizer (also from
 * sanitize-html) blocks `url(...)` and other exfiltration vectors.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    // Document structure
    'article', 'section', 'aside', 'header', 'footer', 'main', 'nav',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'span', 'br', 'hr',
    'blockquote', 'pre', 'code',
    'figure', 'figcaption',
    'details', 'summary',
    'style',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Inline
    'a', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup', 'abbr',
    'kbd', 'samp', 'var',
    // Embeds
    'img', 'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
    'polygon', 'text', 'tspan', 'defs', 'marker', 'use', 'pattern',
    'linearGradient', 'radialGradient', 'stop',
    // SVG <title> for native hover tooltips on chart elements. Listed
    // separately from HTML <title> intentionally: sanitize-html doesn't
    // scope by parent, but admitting <title> here is safe because (a) the
    // body renders inside a div, not <head>, and (b) the tag has no
    // attributes in our allow-list, so the only payload is its text.
    'title',
    'video', 'audio', 'source', 'track',
  ],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'title', 'lang', 'dir'],
    a: ['href', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height', 'loading'],
    video: ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height'],
    audio: ['src', 'controls', 'autoplay', 'loop', 'muted'],
    source: ['src', 'type'],
    track: ['src', 'kind', 'srclang', 'label', 'default'],
    th: ['colspan', 'rowspan', 'scope'],
    td: ['colspan', 'rowspan', 'headers'],
    col: ['span'],
    colgroup: ['span'],
    details: ['open'],
    code: ['class'], // for language-* highlighting classes
    pre: ['class'],
    svg: ['viewBox', 'xmlns', 'width', 'height', 'fill', 'stroke', 'preserveAspectRatio'],
    g: ['transform', 'fill', 'stroke', 'opacity'],
    path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'transform'],
    rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity', 'transform'],
    circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width', 'opacity'],
    ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width', 'opacity'],
    line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'opacity'],
    polyline: ['points', 'fill', 'stroke', 'stroke-width', 'opacity'],
    polygon: ['points', 'fill', 'stroke', 'stroke-width', 'opacity'],
    text: ['x', 'y', 'fill', 'font-size', 'font-family', 'text-anchor', 'dominant-baseline', 'transform'],
    tspan: ['x', 'y', 'dx', 'dy', 'fill', 'font-size', 'font-weight'],
    marker: ['id', 'viewBox', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient'],
    use: ['href', 'xlink:href', 'x', 'y', 'width', 'height'],
    pattern: ['id', 'viewBox', 'width', 'height', 'patternUnits'],
    linearGradient: ['id', 'x1', 'y1', 'x2', 'y2', 'gradientUnits'],
    radialGradient: ['id', 'cx', 'cy', 'r', 'fx', 'fy', 'gradientUnits'],
    stop: ['offset', 'stop-color', 'stop-opacity'],
  },
  allowedSchemes: ['http', 'https', 'data', 'mailto'],
  // Force-rel external links so target=_blank isn't a tabnabbing vector
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        rel: attribs.target === '_blank' ? 'noopener noreferrer' : (attribs.rel ?? ''),
      },
    }),
  },
  allowedSchemesAppliedToAttributes: ['href', 'src', 'cite'],
  parseStyleAttributes: true,
  // When a tag is stripped, sanitize-html keeps its text content by default.
  // For these tags that's pure noise (or worse — a leaked <title> shows up
  // in the document body). Drop the text content along with the tag.
  // 'title' is intentionally NOT in nonTextTags — we allow it (above) so
  // SVG hover tooltips work. nonTextTags only fires when a tag is stripped.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'head'],
  // SVG attribute names are case-sensitive (`viewBox`, `preserveAspectRatio`,
  // `gradientUnits`, etc.). htmlparser2's default lowercases everything,
  // which breaks SVG rendering — disable both element + attribute lowercasing
  // so embedded SVG survives the sanitizer untouched.
  parser: {
    lowerCaseTags: false,
    lowerCaseAttributeNames: false,
  },
};

const BODY_STYLES = [
  'prose prose-sm max-w-none',
  // Tighten default margins so agent-generated HTML doesn't drift open
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-medium',
  '[&_p]:my-2 [&_p]:leading-relaxed',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5',
  '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-0.5',
  '[&_figure]:my-4',
  '[&_figcaption]:mt-1 [&_figcaption]:text-xs [&_figcaption]:text-[--color-muted]',
  '[&_pre]:my-2 [&_pre]:rounded-md [&_pre]:bg-[--color-muted-bg] [&_pre]:p-3 [&_pre]:text-xs [&_pre]:overflow-x-auto',
  '[&_code]:rounded [&_code]:bg-[--color-muted-bg] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:font-mono',
  '[&_a]:text-[--color-accent] [&_a]:underline-offset-2 hover:[&_a]:underline',
  '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md',
  '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse',
  '[&_th]:border [&_th]:border-[--color-border] [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium',
  '[&_td]:border [&_td]:border-[--color-border] [&_td]:px-2 [&_td]:py-1',
];

/**
 * Render an entity body. Auto-detects HTML vs markdown so the same
 * field stores either (the importer wrote markdown from GitHub; new
 * agent-generated bodies are HTML).
 *
 * HTML is sanitized server-side via sanitize-html with an allow-list
 * tuned for research write-ups: tables, figures, SVG, details/summary,
 * inline images. No <script>, no event handlers.
 */
export function RichBody({ children, className }: { children: string; className?: string }) {
  if (!children?.trim()) {
    return <p className={cn('text-sm text-[--color-muted]', className)}>No description.</p>;
  }
  if (looksLikeHtml(children)) {
    // KaTeX renders BEFORE sanitization so its <span class="katex …">
    // output flows through the sanitizer naturally (class attribute is
    // already in the allow-list).
    const withMath = renderMathDelimiters(children);
    const safe = sanitizeHtml(withMath, SANITIZE_OPTIONS);
    return (
      <div
        className={cn(BODY_STYLES, className)}
        // eslint-disable-next-line react/no-danger -- sanitized above
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }
  return <Markdown className={className}>{children}</Markdown>;
}
