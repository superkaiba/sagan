'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { Markdown } from './Markdown';
import { useAnchoredComments } from './AnchoredCommentsContext';

const CODEX_REPLY_MARKER = '<!-- agent:codex -->';
type CommentAgentName = 'Claude' | 'Codex';

interface Comment {
  id: string;
  entityKind: string;
  entityId: string;
  parentCommentId: string | null;
  authorUserId: string | null;
  authorKind: 'human' | 'claude' | 'codex' | 'system';
  kind: 'discussion' | 'ask_claude' | 'todo';
  body: string;
  anchoredQuote: string | null;
  mentions: string[] | null;
  agentRunId: string | null;
  agentRunStatus: string | null;
  agentRunKind: string | null;
  agentRunRequest: string | null;
  autoContinueClaude: boolean;
  resolvedAt: string | null;
  resolvedSummaryMd: string | null;
  createdAt: string;
  authorEmail: string | null;
  authorDisplayName: string | null;
}

export function Comments({ entityKind, entityId }: { entityKind: string; entityId: string }) {
  const anchorCtx = useAnchoredComments();
  const [items, setItems] = useState<Comment[]>([]);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [revising, setRevising] = useState(false);
  const [reviseRunId, setReviseRunId] = useState<string | null>(null);
  const [reviseError, setReviseError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const threadsRef = useRef<HTMLDivElement>(null);
  const [threadOriginTop, setThreadOriginTop] = useState<number | null>(null);
  const [threadHeights, setThreadHeights] = useState<Record<string, number>>({});
  const [alignAnchoredThreads, setAlignAnchoredThreads] = useState(false);
  const [scrolledPastIds, setScrolledPastIds] = useState<Set<string>>(() => new Set());

  async function load() {
    const res = await fetch(
      `/api/comments?entityKind=${encodeURIComponent(entityKind)}&entityId=${encodeURIComponent(entityId)}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as { comments: Comment[]; viewerUserId?: string };
    setItems(data.comments);
    setViewerUserId(data.viewerUserId ?? null);
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityKind, entityId]);

  // Publish anchor list (root-level comments with quotes) into the shared
  // context so NarrativeBody can paint <mark> wraps. Replies aren't wrapped
  // separately — their quote, if any, is shown in the card but the root
  // anchor is the highlight target.
  useEffect(() => {
    if (!anchorCtx) return;
    const next = items
      .filter((c) => !c.parentCommentId && !c.resolvedAt && c.anchoredQuote)
      .map((c) => ({ id: c.id, quote: c.anchoredQuote as string }));
    anchorCtx.setAnchors(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, !!anchorCtx]);

  async function postComment(
    text: string,
    parentCommentId?: string | null,
    anchoredQuote?: string | null,
    askAgent?: CommentAgentName,
  ) {
    // The API's zod schema marks both fields .optional() — that means undefined
    // or absent, NOT null. Building the payload conditionally keeps null out.
    const payload: Record<string, unknown> = { entityKind, entityId, body: text };
    if (parentCommentId) payload.parentCommentId = parentCommentId;
    if (anchoredQuote) payload.anchoredQuote = anchoredQuote;
    if (askAgent) payload.askAgent = askAgent;
    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  }

  async function submitTopLevel(askAgent?: CommentAgentName) {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setReviseError(null);
    try {
      const pendingQuote = anchorCtx?.pendingAnchor?.quote ?? null;
      const ok = await postComment(text, null, pendingQuote, askAgent);
      if (ok) {
        setBody('');
        anchorCtx?.setPendingAnchor(null);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onTopLevelSubmit(e: FormEvent) {
    e.preventDefault();
    await submitTopLevel();
  }

  async function submitReply(parentId: string, askAgent?: CommentAgentName) {
    const text = replyBody.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setReviseError(null);
    try {
      const ok = await postComment(text, parentId, null, askAgent);
      if (ok) {
        setReplyBody('');
        setReplyTo(null);
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function onReplySubmit(e: FormEvent, parentId: string) {
    e.preventDefault();
    await submitReply(parentId);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/comments/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await load();
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function shouldSubmitFromTextarea(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return false;
    event.preventDefault();
    return true;
  }

  async function reviseFromComments() {
    setRevising(true);
    setReviseError(null);
    try {
      const res = await fetch('/api/comments/revise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityKind, entityId }),
      });
      const data = (await res.json().catch(() => ({}))) as { runId?: string; error?: string; message?: string };
      if (!res.ok || !data.runId) {
        throw new Error(data.message ?? data.error ?? 'Revision run failed to start.');
      }
      setReviseRunId(data.runId);
      await load();
    } catch (err) {
      setReviseError(err instanceof Error ? err.message : 'Revision run failed to start.');
    } finally {
      setRevising(false);
    }
  }

  // Group comments by thread root (parent or self).
  const roots = items.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of items) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }
  for (const arr of repliesByParent.values()) {
    arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const visibleRoots = showResolved ? roots : roots.filter((r) => !r.resolvedAt);
  const anchorPositionById = useMemo(() => {
    const positions = new Map<string, { top: number; height: number }>();
    for (const position of anchorCtx?.anchorPositions ?? []) {
      if (position.found) positions.set(position.id, { top: position.top, height: position.height });
    }
    return positions;
  }, [anchorCtx?.anchorPositions]);
  const orderedVisibleRoots = useMemo(() => {
    const anchored: Comment[] = [];
    const unanchored: Comment[] = [];
    for (const root of visibleRoots) {
      if (anchorPositionById.has(root.id)) anchored.push(root);
      else unanchored.push(root);
    }
    anchored.sort((a, b) => {
      const aPos = anchorPositionById.get(a.id)?.top ?? 0;
      const bPos = anchorPositionById.get(b.id)?.top ?? 0;
      return aPos - bPos || a.createdAt.localeCompare(b.createdAt);
    });
    return [...anchored, ...unanchored];
  }, [anchorPositionById, visibleRoots]);
  const unresolvedCount = items.filter((c) => !c.resolvedAt).length;
  const activeAgentStatuses = new Set(['queued', 'running', 'approved', 'deploying', 'awaiting_approval']);
  const activeAgentCount = items.filter((c) => c.agentRunId && c.agentRunStatus && activeAgentStatuses.has(c.agentRunStatus)).length;

  function visibleBody(c: Comment) {
    return c.body.startsWith(CODEX_REPLY_MARKER)
      ? c.body.slice(CODEX_REPLY_MARKER.length).trimStart()
      : c.body;
  }

  function authorLabel(c: Comment) {
    if (c.authorKind === 'codex' || c.body.startsWith(CODEX_REPLY_MARKER)) return 'Codex';
    if (c.authorKind === 'claude') return 'Claude';
    if (c.authorKind === 'system') return 'System';
    if (viewerUserId && c.authorUserId === viewerUserId) return 'You';
    return c.authorDisplayName || c.authorEmail || 'Commenter';
  }

  function commentAgentName(c: Comment): CommentAgentName {
    if (c.authorKind === 'codex' || c.body.startsWith(CODEX_REPLY_MARKER)) return 'Codex';
    if (c.mentions?.some((mention) => mention.toLowerCase() === 'agent:codex')) return 'Codex';
    if (c.mentions?.some((mention) => mention.toLowerCase() === 'agent:claude')) return 'Claude';
    if (c.agentRunRequest && /^Comment responder:\s*Codex\b/im.test(c.agentRunRequest)) return 'Codex';
    if (/(^|\s)@codex\b/i.test(c.body)) return 'Codex';
    return 'Claude';
  }

  function autoContinueLabel(c: Comment) {
    return `${commentAgentName(c)} auto-continues`;
  }

  function agentStatusLabel(c: Comment) {
    if (!c.agentRunId) return null;
    const status = c.agentRunStatus ?? 'queued';
    if (c.agentRunKind === 'apply') return `Revision ${status.replace(/_/g, ' ')}`;
    return `${commentAgentName(c)} ${status.replace(/_/g, ' ')}`;
  }

  function summarizeComment(c: Comment) {
    const text = visibleBody(c)
      .replace(/```[\s\S]*?```/g, ' code ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_>~-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return `${authorLabel(c)} reply`;
    const sentence = text.match(/^.{1,96}(?:[.!?](?=\s|$)|$)/)?.[0] ?? text.slice(0, 96);
    const summary = sentence.trim();
    return summary.length < text.length ? `${summary.replace(/[.!?]$/, '')}...` : summary;
  }

  useLayoutEffect(() => {
    function measureRail() {
      const section = sectionRef.current;
      const threads = threadsRef.current;
      if (!section || !threads) return;

      const canAlign =
        Boolean(section.closest('aside')) &&
        window.matchMedia('(min-width: 1024px)').matches &&
        anchorPositionById.size > 0;
      setAlignAnchoredThreads(canAlign);
      setThreadOriginTop(Math.round(threads.getBoundingClientRect().top + window.scrollY));

      const next: Record<string, number> = {};
      threads.querySelectorAll<HTMLElement>('[data-comment-thread-id]').forEach((node) => {
        const id = node.dataset.commentThreadId;
        if (id) next[id] = Math.ceil(node.getBoundingClientRect().height);
      });
      setThreadHeights((prev) => (sameNumberRecord(prev, next) ? prev : next));

      // Auto-collapse threads whose anchor has scrolled off-screen so they
      // don't pile up at full size in the sticky sidebar.
      const viewportTop = window.scrollY;
      const viewportBottom = viewportTop + window.innerHeight;
      const past = new Set<string>();
      anchorPositionById.forEach((pos, id) => {
        const anchorBottom = pos.top + pos.height;
        if (anchorBottom < viewportTop - 40 || pos.top > viewportBottom + 40) {
          past.add(id);
        }
      });
      setScrolledPastIds((prev) => (sameStringSet(prev, past) ? prev : past));
    }

    measureRail();
    document.addEventListener('scroll', measureRail, true);
    window.addEventListener('resize', measureRail);
    return () => {
      document.removeEventListener('scroll', measureRail, true);
      window.removeEventListener('resize', measureRail);
    };
  }, [anchorPositionById, orderedVisibleRoots.length, collapsedIds, replyTo, showResolved, items.length]);

  const threadMargins = useMemo(() => {
    const margins = new Map<string, number>();
    if (!alignAnchoredThreads || threadOriginTop == null) return margins;
    let cursor = 0;
    for (const root of orderedVisibleRoots) {
      const position = anchorPositionById.get(root.id);
      const target = position ? Math.max(0, position.top - threadOriginTop) : cursor;
      const marginTop = Math.max(0, target - cursor);
      margins.set(root.id, Math.round(marginTop));
      cursor += marginTop + (threadHeights[root.id] ?? 80) + 8;
    }
    return margins;
  }, [alignAnchoredThreads, anchorPositionById, orderedVisibleRoots, threadHeights, threadOriginTop]);

  function renderComment(c: Comment, isReply = false, replyCount = 0) {
    const isAgent = c.authorKind === 'claude' || c.authorKind === 'codex';
    const collapsed = collapsedIds.has(c.id);
    const displayBody = visibleBody(c);
    const hoverable = !isReply && !!c.anchoredQuote && !!anchorCtx;
    const isHovered = hoverable && anchorCtx?.hoveredId === c.id;
    const agentLabel = agentStatusLabel(c);
    const agentActive = Boolean(c.agentRunStatus && activeAgentStatuses.has(c.agentRunStatus));
    const scrolledPast =
      alignAnchoredThreads && !isReply && scrolledPastIds.has(c.id) && !isHovered;
    const wrap = `group p-3 transition-all duration-150 ${c.resolvedAt ? 'opacity-60' : ''} ${isAgent ? 'bg-[--color-muted-bg]' : ''} ${isReply ? 'border-l-2 border-[--color-border] ml-4' : ''} ${isHovered ? 'bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]' : ''} ${scrolledPast ? 'max-h-9 overflow-hidden opacity-50 hover:opacity-100 hover:max-h-none' : ''}`;
    return (
      <article
        key={c.id}
        className={wrap}
        onMouseEnter={hoverable ? () => anchorCtx?.setHoveredId(c.id) : undefined}
        onMouseLeave={hoverable ? () => anchorCtx?.setHoveredId(null) : undefined}
      >
        <header className="mb-1 flex flex-wrap items-baseline gap-2 text-xs text-[--color-muted]">
          <button
            type="button"
            onClick={() => toggleCollapsed(c.id)}
            aria-expanded={!collapsed}
            className="font-mono text-[10px] text-[--color-muted] hover:text-[--color-fg]"
            title={collapsed ? 'Expand comment' : 'Collapse comment'}
          >
            {collapsed ? '+' : '-'}
          </button>
          <span className={isAgent ? 'font-medium text-[--color-accent]' : 'font-medium text-[--color-fg]'}>
            {authorLabel(c)}
          </span>
          <span>·</span>
          <time>{new Date(c.createdAt).toLocaleString()}</time>
          {collapsed ? (
            <>
              <span>·</span>
              <span className="min-w-0 flex-1 truncate text-[--color-muted]">
                <span className="font-medium text-[--color-fg]">AI summary:</span> {summarizeComment(c)}
              </span>
            </>
          ) : null}
          {!isReply && replyCount > 0 ? (
            <span className="text-[10px] text-[--color-muted]">
              {replyCount} repl{replyCount === 1 ? 'y' : 'ies'}
            </span>
          ) : null}
          {agentLabel && c.agentRunId ? (
            <Link
              href={`/agent/${c.agentRunId}`}
              className="inline-flex items-center gap-1 rounded-full bg-[--color-accent] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[--color-accent-fg]"
            >
              {agentActive ? <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden="true" /> : null}
              {agentLabel}
            </Link>
          ) : null}
          {!isReply && c.autoContinueClaude ? (
            <span className="ml-auto rounded-md border border-[--color-border] bg-[--color-muted-bg] px-2 py-0.5 text-[10px] font-medium text-[--color-muted]">
              {autoContinueLabel(c)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => patch(c.id, { resolved: !c.resolvedAt })}
            className="text-[10px] uppercase tracking-wide opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
          >
            {c.resolvedAt ? 'reopen' : 'resolve'}
          </button>
        </header>
        {collapsed ? null : (
          <>
            {c.resolvedAt && c.resolvedSummaryMd ? (
              <p className="mb-1 text-xs italic text-[--color-muted]">
                resolved · {c.resolvedSummaryMd}
              </p>
            ) : null}
            {c.anchoredQuote && !isReply ? (
              <button
                type="button"
                onClick={() => anchorCtx?.requestScrollTo(c.id)}
                className="mb-2 block max-w-full truncate border-l-2 border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] px-2 py-1 text-left text-xs italic text-[--color-muted] hover:text-[--color-fg]"
                title="Jump to the highlighted text"
              >
                “{c.anchoredQuote}”
              </button>
            ) : null}
            <Markdown>{displayBody}</Markdown>
            <div className="mt-2">
              {replyTo === c.id ? (
                <form onSubmit={(e) => onReplySubmit(e, c.id)} className="space-y-1">
                  <textarea
                    ref={replyRef}
                    rows={2}
                    autoFocus
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    onKeyDown={(event) => {
                      if (shouldSubmitFromTextarea(event)) void submitReply(c.id);
                    }}
                    placeholder="Reply. Enter posts; Shift-Enter adds a line."
                    className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
                  />
                  <div className="flex justify-end gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => void submitReply(c.id, 'Claude')}
                      disabled={submitting || !replyBody.trim()}
                      className="text-[--color-muted] hover:text-[--color-fg]"
                    >
                      ask Claude
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitReply(c.id, 'Codex')}
                      disabled={submitting || !replyBody.trim()}
                      className="text-[--color-muted] hover:text-[--color-fg]"
                    >
                      ask Codex
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(null);
                        setReplyBody('');
                      }}
                      className="text-[--color-muted] hover:text-[--color-fg]"
                    >
                      cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !replyBody.trim()}
                      className="rounded-md bg-[--color-accent] px-2 py-0.5 font-medium text-[--color-accent-fg] disabled:opacity-50"
                    >
                      Reply
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyTo(c.id)}
                  className="text-xs text-[--color-muted] opacity-0 transition group-hover:opacity-100 hover:text-[--color-fg]"
                >
                  reply
                </button>
              )}
            </div>
          </>
        )}
      </article>
    );
  }

  return (
    <section ref={sectionRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[--color-muted]">Comments</h2>
          {activeAgentCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[--color-info-border] bg-[--color-info-bg] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[--color-info]">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Agent running
            </span>
          ) : null}
          {reviseRunId ? (
            <Link href={`/agent/${reviseRunId}`} className="text-xs text-[--color-accent] underline-offset-2 hover:underline">
              revision run
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void reviseFromComments()}
            disabled={revising || unresolvedCount === 0}
            className="inline-flex items-center gap-1 rounded-md border border-[--color-border] px-2.5 py-1 text-xs font-medium text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg] disabled:opacity-45"
          >
            {revising ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
            Revise
          </button>
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="text-xs text-[--color-muted] hover:text-[--color-fg]"
          >
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </button>
        </div>
      </div>
      {reviseError ? <p className="text-xs text-[--color-danger]">{reviseError}</p> : null}

      <div ref={threadsRef} className="space-y-2">
        {visibleRoots.length === 0 ? (
          <p className="rounded-lg border border-[--color-border] p-3 text-sm text-[--color-muted]">No comments yet.</p>
        ) : (
          orderedVisibleRoots.map((root) => {
            const replies = repliesByParent.get(root.id) ?? [];
            const collapsed = collapsedIds.has(root.id);
            const baseClass = 'rounded-lg border border-[--color-border] bg-[--color-panel] shadow-sm divide-y divide-[--color-border]';
            return (
              <div
                key={root.id}
                data-comment-thread-id={root.id}
                className={`${baseClass} ${alignAnchoredThreads ? 'transition-[margin-top] duration-150 ease-out' : ''}`}
                style={alignAnchoredThreads ? { marginTop: threadMargins.get(root.id) ?? 0 } : undefined}
              >
                {renderComment(root, false, replies.length)}
                {collapsed ? null : replies.map((reply) => renderComment(reply, true))}
              </div>
            );
          })
        )}
      </div>

      <form
        onSubmit={onTopLevelSubmit}
        className="space-y-2 rounded-lg border border-[--color-border] bg-[--color-muted-bg] p-3"
      >
        {anchorCtx?.pendingAnchor ? (
          <div className="flex items-start gap-2 rounded-md border border-[--color-accent] bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] px-2 py-1.5 text-xs">
            <span className="mt-0.5 text-[--color-muted]">Commenting on:</span>
            <span className="min-w-0 flex-1 truncate italic text-[--color-fg]">
              “{anchorCtx.pendingAnchor.quote}”
            </span>
            <button
              type="button"
              aria-label="Clear anchor"
              onClick={() => anchorCtx.setPendingAnchor(null)}
              className="text-[--color-muted] hover:text-[--color-fg]"
            >
              ×
            </button>
          </div>
        ) : null}
        <textarea
          ref={bodyRef}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(event) => {
            if (shouldSubmitFromTextarea(event)) void submitTopLevel();
          }}
          placeholder={
            anchorCtx?.pendingAnchor
              ? 'Write a comment about the highlighted text. Enter posts; Shift-Enter adds a line.'
              : 'Add a comment. Enter posts; Shift-Enter adds a line.'
          }
          className="w-full rounded-md border border-[--color-border] bg-[--color-bg] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--color-accent]"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[--color-muted]">Enter posts. Shift-Enter adds a line.</p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void submitTopLevel('Claude')}
              disabled={submitting || !body.trim()}
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
            >
              Ask Claude
            </button>
            <button
              type="button"
              onClick={() => void submitTopLevel('Codex')}
              disabled={submitting || !body.trim()}
              className="rounded-md border border-[--color-border] px-3 py-1.5 text-xs font-medium text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
            >
              Ask Codex
            </button>
            <button
              type="submit"
              disabled={submitting || !body.trim()}
              className="rounded-md bg-[--color-accent] px-3 py-1.5 text-xs font-medium text-[--color-accent-fg] disabled:opacity-50"
            >
              {submitting ? 'Posting…' : 'Comment'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}

function sameNumberRecord(a: Record<string, number>, b: Record<string, number>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function sameStringSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}
