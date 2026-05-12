'use client';

import { useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import {
  useAnchoredComments,
  type AnchorRecord,
} from './AnchoredCommentsContext';

/**
 * Render a narrative body. If the body looks like raw HTML (starts with
 * an HTML tag after whitespace), inject it via dangerouslySetInnerHTML so
 * Claude-authored HTML artifacts render with their own inline styles +
 * SVG. Otherwise fall through to Markdown rendering.
 *
 * When wrapped in an AnchoredCommentsProvider, this component also:
 *   - wraps each anchored quote in a <mark data-comment-id>
 *   - shows a floating "Comment" button on text selection
 *   - syncs hover state with the comments sidebar
 *
 * Trust model: project_narratives writes require an authenticated session.
 */
export function NarrativeBody({ body }: { body: string }) {
  const trimmed = body.trimStart();
  const looksHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<div') ||
    trimmed.startsWith('<section') ||
    trimmed.startsWith('<article') ||
    trimmed.startsWith('<main') ||
    trimmed.startsWith('<style');

  return looksHtml ? <HtmlNarrative body={body} /> : <MarkdownNarrative body={body} />;
}

function HtmlNarrative({ body }: { body: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useAnchorBehaviors(ref);
  return (
    <div
      ref={ref}
      className="narrative-html relative"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: author is trusted (auth-gated write)
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

function MarkdownNarrative({ body }: { body: string }) {
  // No anchor wrapping on the markdown path: react-markdown owns its child
  // text nodes and re-renders would clobber any imperatively inserted marks.
  // Project narratives all author as HTML, so this is mostly a fallback for
  // legacy bodies.
  return <Markdown>{body}</Markdown>;
}

/**
 * Manage anchor wrapping, hover sync, scroll-to-mark, and the floating
 * "Comment" selection popover. Returns nothing when no anchor context is
 * present, leaving the narrative untouched.
 */
function useAnchorBehaviors(ref: React.RefObject<HTMLDivElement | null>) {
  const ctx = useAnchoredComments();
  const [popover, setPopover] = useState<{
    left: number;
    top: number;
    quote: string;
  } | null>(null);

  const anchors = ctx?.anchors;
  const hoveredId = ctx?.hoveredId ?? null;
  const setHoveredId = ctx?.setHoveredId;
  const scrollToCommentId = ctx?.scrollToCommentId ?? null;
  const clearScrollRequest = ctx?.clearScrollRequest;
  const setPendingAnchor = ctx?.setPendingAnchor;

  // Re-wrap anchors only when the list changes (not on every hover).
  useEffect(() => {
    if (!anchors || !ref.current) return;
    applyAnchors(ref.current, anchors);
  }, [anchors, ref]);

  // Sync hovered class on marks.
  useEffect(() => {
    if (!ref.current) return;
    const marks = ref.current.querySelectorAll<HTMLElement>('mark[data-comment-id]');
    marks.forEach((m) => {
      const matches = m.dataset.commentId === hoveredId;
      m.classList.toggle('is-hovered', matches);
    });
  }, [hoveredId, anchors, ref]);

  // Mark hover -> context hoveredId.
  useEffect(() => {
    if (!setHoveredId || !ref.current) return;
    const el = ref.current;
    function onOver(e: Event) {
      const target = e.target as HTMLElement | null;
      const m = target?.closest?.('mark[data-comment-id]') as HTMLElement | null;
      if (m && setHoveredId) setHoveredId(m.dataset.commentId ?? null);
    }
    function onOut(e: Event) {
      const target = e.target as HTMLElement | null;
      const m = target?.closest?.('mark[data-comment-id]') as HTMLElement | null;
      if (m && setHoveredId) setHoveredId(null);
    }
    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseout', onOut);
    };
  }, [setHoveredId, ref]);

  // Scroll to mark when a comment requests it.
  useEffect(() => {
    if (!scrollToCommentId || !clearScrollRequest || !ref.current) return;
    const m = ref.current.querySelector<HTMLElement>(
      `mark[data-comment-id="${cssEscape(scrollToCommentId)}"]`,
    );
    if (m) {
      m.scrollIntoView({ behavior: 'smooth', block: 'center' });
      m.classList.add('is-flash');
      window.setTimeout(() => m.classList.remove('is-flash'), 1400);
    }
    clearScrollRequest();
  }, [scrollToCommentId, clearScrollRequest, ref]);

  // Selection -> floating Comment button.
  useEffect(() => {
    if (!setPendingAnchor || !ref.current) return;
    const el = ref.current;
    function isInsidePopover(node: EventTarget | null): boolean {
      const target = node as HTMLElement | null;
      return !!target?.closest?.('[data-anchor-popover]');
    }
    function update(e?: Event) {
      // A mouseup *on* the popover means the user is interacting with it —
      // don't recompute (and don't clear it just because the click collapsed
      // the selection).
      if (e && isInsidePopover(e.target)) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setPopover(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const node = range.commonAncestorContainer;
      if (!el.contains(node)) {
        setPopover(null);
        return;
      }
      const raw = sel.toString();
      const quote = raw.replace(/\s+/g, ' ').trim();
      if (quote.length < 3) {
        setPopover(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      setPopover({
        left: rect.left + rect.width / 2 - containerRect.left,
        top: rect.top - containerRect.top - 8,
        quote,
      });
    }
    function onDown(e: MouseEvent) {
      if (isInsidePopover(e.target)) return;
      // Mouse-down outside popover starts a fresh selection cycle.
      setPopover(null);
    }
    document.addEventListener('mouseup', update);
    document.addEventListener('keyup', update);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('mouseup', update);
      document.removeEventListener('keyup', update);
      document.removeEventListener('mousedown', onDown);
    };
  }, [setPendingAnchor, ref]);

  // Render the floating button via an imperative absolute element. The
  // container has `position: relative`, so we append a sibling div. We avoid
  // a React-rendered child here because for HTML narratives the parent uses
  // dangerouslySetInnerHTML and React doesn't own the children.
  //
  // Activation listens on mousedown with preventDefault() so the browser
  // doesn't collapse the user's text selection before our handler runs —
  // Chrome/Firefox both clear the selection on mousedown otherwise.
  useEffect(() => {
    if (!setPendingAnchor || !ref.current) return;
    const el = ref.current;
    const existing = el.querySelector<HTMLElement>(':scope > [data-anchor-popover]');
    if (popover) {
      const node =
        existing ??
        (() => {
          const created = document.createElement('div');
          created.setAttribute('data-anchor-popover', '');
          created.style.userSelect = 'none';
          created.className =
            'absolute z-20 -translate-x-1/2 -translate-y-full rounded-md border border-[--color-border] bg-[--color-panel] px-2 py-1 text-xs font-medium shadow-md';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = '💬 Comment';
          btn.className = 'text-[--color-fg] hover:text-[--color-accent]';
          created.appendChild(btn);
          el.appendChild(created);
          return created;
        })();
      node.style.left = `${popover.left}px`;
      node.style.top = `${popover.top}px`;
      const btn = node.querySelector('button');
      if (btn) {
        const handler = (e: MouseEvent) => {
          // Block the default mousedown so the browser keeps the selection
          // alive and so focus does not transfer to the button.
          e.preventDefault();
          e.stopPropagation();
          setPendingAnchor({ quote: popover.quote });
          setPopover(null);
          window.getSelection()?.removeAllRanges();
        };
        // Replace any prior listener by tracking it on the element.
        const prior = (btn as HTMLButtonElement & { __anchorHandler?: typeof handler }).__anchorHandler;
        if (prior) btn.removeEventListener('mousedown', prior);
        btn.addEventListener('mousedown', handler);
        (btn as HTMLButtonElement & { __anchorHandler?: typeof handler }).__anchorHandler = handler;
      }
    } else if (existing) {
      existing.remove();
    }
  }, [setPendingAnchor, popover, ref]);
}

function cssEscape(s: string): string {
  // Comment ids are uuids, but be defensive.
  if (typeof (window as unknown as { CSS?: { escape?: (s: string) => string } }).CSS?.escape === 'function') {
    return (window as unknown as { CSS: { escape: (s: string) => string } }).CSS.escape(s);
  }
  return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}

function applyAnchors(root: HTMLElement, anchors: AnchorRecord[]) {
  // Drop previous marks first so re-renders stay idempotent.
  unwrapAllMarks(root);
  for (const a of anchors) {
    const quote = a.quote?.replace(/\s+/g, ' ').trim();
    if (!quote || quote.length < 3) continue;
    wrapFirstMatch(root, quote, a.id);
  }
}

function unwrapAllMarks(root: HTMLElement) {
  const marks = Array.from(root.querySelectorAll('mark[data-comment-id]'));
  for (const m of marks) {
    const parent = m.parentNode;
    if (!parent) continue;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  }
  // Merge adjacent text nodes so subsequent matches see contiguous text.
  root.normalize();
}

function wrapFirstMatch(root: HTMLElement, quote: string, commentId: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest('mark[data-comment-id]')) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script,style,[data-anchor-popover]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  // Search node-by-node, but also try a window across two siblings for the
  // common case where the quote spans <strong>/<em>/<span> boundaries.
  let prev: Text | null = null;
  while (true) {
    const next = walker.nextNode() as Text | null;
    if (!next) break;
    if (tryWrapSingle(next, quote, commentId)) return;
    if (prev && tryWrapPair(prev, next, quote, commentId)) return;
    prev = next;
  }
}

function tryWrapSingle(node: Text, quote: string, commentId: string): boolean {
  const idx = indexOfNormalized(node.nodeValue ?? '', quote);
  if (idx < 0) return false;
  splitAndWrapTextNode(node, idx, idx + quote.length, commentId);
  return true;
}

/**
 * Handle quotes that cross a single inline-element boundary by stitching the
 * trailing chars of `a` with the leading chars of `b`. Only goes one boundary
 * deep — good enough for "spans **one bold** word" cases.
 */
function tryWrapPair(a: Text, b: Text, quote: string, commentId: string): boolean {
  const aVal = a.nodeValue ?? '';
  const bVal = b.nodeValue ?? '';
  const combined = `${aVal}${bVal}`;
  const idx = indexOfNormalized(combined, quote);
  if (idx < 0 || idx + quote.length <= aVal.length || idx >= aVal.length) return false;
  // Wrap aVal[idx..] and bVal[..end-aVal.length]. We do this as two marks
  // sharing the same commentId so hover behaves consistently.
  const aEnd = aVal.length;
  const bEnd = idx + quote.length - aVal.length;
  splitAndWrapTextNode(a, idx, aEnd, commentId);
  splitAndWrapTextNode(b, 0, bEnd, commentId);
  return true;
}

function splitAndWrapTextNode(text: Text, start: number, end: number, commentId: string) {
  const value = text.nodeValue ?? '';
  const before = value.slice(0, start);
  const middle = value.slice(start, end);
  const after = value.slice(end);
  const parent = text.parentNode;
  if (!parent) return;
  const mark = document.createElement('mark');
  mark.setAttribute('data-comment-id', commentId);
  mark.className = 'anchor-mark';
  mark.textContent = middle;
  const fragments: Node[] = [];
  if (before) fragments.push(document.createTextNode(before));
  fragments.push(mark);
  if (after) fragments.push(document.createTextNode(after));
  const anchor = text.nextSibling;
  parent.removeChild(text);
  for (const f of fragments) parent.insertBefore(f, anchor);
}

/**
 * indexOf with whitespace normalization: maps the search query and the
 * haystack to single-space form, finds an index in the normalized haystack,
 * then maps back to the raw index in `haystack`. Returns -1 if not found.
 */
function indexOfNormalized(haystack: string, needle: string): number {
  if (haystack.indexOf(needle) >= 0) return haystack.indexOf(needle);
  const normHay = haystack.replace(/\s+/g, ' ');
  const normNeedle = needle.replace(/\s+/g, ' ');
  const normIdx = normHay.indexOf(normNeedle);
  if (normIdx < 0) return -1;
  // Walk `haystack` to find the raw offset that corresponds to `normIdx`.
  let rawIdx = 0;
  let normCursor = 0;
  let lastWasSpace = false;
  while (rawIdx < haystack.length && normCursor < normIdx) {
    const ch = haystack[rawIdx]!;
    if (/\s/.test(ch)) {
      if (!lastWasSpace) normCursor += 1;
      lastWasSpace = true;
    } else {
      normCursor += 1;
      lastWasSpace = false;
    }
    rawIdx += 1;
  }
  return rawIdx;
}
