'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MessageSquare, Plus, Send, Wrench, X } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/cn';

type DockMode = 'chat' | 'improve';

type ConversationSession = {
  id: string;
  kind: DockMode;
  title: string;
  createdByEmail: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
  activeRunCount: number;
  latestRun: ConversationRun | null;
};

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  body: string | null;
  createdAt: string;
};

type ConversationRun = {
  id: string;
  kind: 'plan' | 'apply' | 'qa' | 'experiment';
  status: string;
  request: string;
  lastError?: string | null;
  updatedAt: string;
  createdAt?: string;
};

const ACTIVE_STATUSES = new Set(['queued', 'running', 'approved', 'deploying', 'awaiting_approval']);

function cleanBody(body: string | null) {
  return (body ?? '').replace(/^\[Dashboard improvement\]\s*/i, '').trim();
}

function relativeTime(value: string | null | undefined) {
  if (!value) return 'new';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

export function ConversationDock() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DockMode>('chat');
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [runs, setRuns] = useState<ConversationRun[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleSessions = useMemo(() => sessions.filter((session) => session.kind === mode), [sessions, mode]);
  const activeSession = visibleSessions.find((session) => session.id === activeSid) ?? null;
  const activeRunCount = sessions.reduce((sum, session) => sum + session.activeRunCount, 0);
  const activeRuns = runs.filter((run) => ACTIVE_STATUSES.has(run.status));

  const loadSessions = useCallback(async () => {
    const res = await fetch('/api/conversations', { cache: 'no-store' });
    if (!res.ok) {
      setLoadingSessions(false);
      return;
    }
    const data = (await res.json()) as { sessions: ConversationSession[] };
    setSessions(data.sessions);
    setLoadingSessions(false);
  }, []);

  const loadMessages = useCallback(async (sid: string) => {
    setLoadingMessages(true);
    const res = await fetch(`/api/conversations/${sid}/messages`, { cache: 'no-store' });
    if (!res.ok) {
      setMessages([]);
      setRuns([]);
      setLoadingMessages(false);
      return;
    }
    const data = (await res.json()) as { messages: ConversationMessage[]; runs: ConversationRun[] };
    setMessages(data.messages);
    setRuns(data.runs);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      setOpen(window.localStorage.getItem('sagan-conversation-dock-open') === '1');
      const savedMode = window.localStorage.getItem('sagan-conversation-dock-mode');
      if (savedMode === 'chat' || savedMode === 'improve') setMode(savedMode);
    } catch {}
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!mounted) return;
    const timer = window.setInterval(() => {
      void loadSessions();
      if (open && activeSid) void loadMessages(activeSid);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [activeSid, loadMessages, loadSessions, mounted, open]);

  useEffect(() => {
    if (activeSid && visibleSessions.some((session) => session.id === activeSid)) return;
    setActiveSid(visibleSessions[0]?.id ?? null);
  }, [activeSid, visibleSessions]);

  useEffect(() => {
    if (!activeSid || !open) {
      setMessages([]);
      setRuns([]);
      return;
    }
    void loadMessages(activeSid);
  }, [activeSid, loadMessages, open]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, runs]);

  function updateOpen(next: boolean) {
    setOpen(next);
    try {
      window.localStorage.setItem('sagan-conversation-dock-open', next ? '1' : '0');
    } catch {}
  }

  function updateMode(next: DockMode) {
    setMode(next);
    try {
      window.localStorage.setItem('sagan-conversation-dock-mode', next);
    } catch {}
  }

  async function createSession(targetMode: DockMode) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: targetMode }),
    });
    if (!res.ok) throw new Error('conversation_create_failed');
    const data = (await res.json()) as { session: ConversationSession };
    setSessions((current) => [data.session, ...current]);
    setActiveSid(data.session.id);
    return data.session.id;
  }

  async function startNew() {
    setError(null);
    setActiveSid(null);
    setMessages([]);
    setRuns([]);
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    setDraft('');

    try {
      const sid = activeSession?.id ?? (await createSession(mode));
      const optimistic: ConversationMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        body: mode === 'improve' ? `[Dashboard improvement]\n${body}` : body,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);

      const res = await fetch(`/api/conversations/${sid}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'send_failed');
      }
      await Promise.all([loadSessions(), loadMessages(sid)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send_failed');
    } finally {
      setSending(false);
    }
  }

  if (!mounted) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => updateOpen(true)}
        className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-md border border-[--color-border] bg-[--color-panel] px-3 py-2 text-sm font-medium text-[--color-fg] shadow-[0_8px_24px_rgba(0,0,0,0.14)] hover:bg-[--color-hover]"
        aria-label="Open conversations"
      >
        <MessageSquare className="h-4 w-4 text-[--color-muted]" />
        <span>Conversations</span>
        {activeRunCount > 0 ? (
          <span className="rounded bg-[--color-accent] px-1.5 py-0.5 text-[10px] text-[--color-accent-fg]">
            {activeRunCount}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className="fixed bottom-3 right-3 z-50 flex h-[min(42rem,calc(100dvh-1.5rem))] w-[min(28rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-[--color-border] bg-[--color-panel] shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[--color-border] bg-[--color-muted-bg] px-3 py-2">
        <MessageSquare className="h-4 w-4 text-[--color-muted]" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">Conversations</span>
        <button
          type="button"
          onClick={() => updateOpen(false)}
          className="rounded-md p-1 text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
          aria-label="Close conversations"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-[--color-border] px-3 py-2">
        {(['chat', 'improve'] as DockMode[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => updateMode(item)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium',
              mode === item
                ? 'border-[--color-accent] bg-[--color-accent] text-[--color-accent-fg]'
                : 'border-[--color-border] bg-[--color-bg] text-[--color-muted] hover:text-[--color-fg]',
            )}
          >
            {item === 'improve' ? <Wrench className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
            {item === 'improve' ? 'Improve' : 'Chat'}
          </button>
        ))}
        <button
          type="button"
          onClick={startNew}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[--color-border] px-2 py-1 text-xs text-[--color-muted] hover:bg-[--color-hover] hover:text-[--color-fg]"
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      <div className="shrink-0 border-b border-[--color-border] bg-[--color-bg] px-2 py-2">
        <div className="max-h-32 space-y-1 overflow-y-auto">
          {loadingSessions ? (
            <p className="px-2 py-1 text-xs text-[--color-muted]">Loading...</p>
          ) : visibleSessions.length === 0 ? (
            <p className="px-2 py-1 text-xs text-[--color-muted]">No {mode === 'improve' ? 'improvement' : 'chat'} conversations yet.</p>
          ) : (
            visibleSessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => setActiveSid(session.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left',
                  session.id === activeSid
                    ? 'border-[--color-accent] bg-[--color-muted-bg]'
                    : 'border-transparent hover:border-[--color-border] hover:bg-[--color-hover]',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-xs font-medium">{session.title}</span>
                {session.latestRun ? (
                  <span className="rounded bg-[--color-muted-bg] px-1.5 py-0.5 text-[10px] text-[--color-muted]">
                    {session.latestRun.status}
                  </span>
                ) : null}
                <span className="text-[10px] text-[--color-muted]">
                  {relativeTime(session.lastMessageAt ?? session.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {activeRuns.length > 0 ? (
          <div className="mb-3 space-y-1 rounded-md border border-[--color-border] bg-[--color-muted-bg] p-2">
            {activeRuns.map((run) => (
              <p key={run.id} className="text-xs text-[--color-muted]">
                <span className="font-medium text-[--color-fg]">{run.kind}</span> run {run.id.slice(0, 8)} is {run.status}.
              </p>
            ))}
          </div>
        ) : null}

        {loadingMessages ? (
          <p className="text-sm text-[--color-muted]">Loading...</p>
        ) : !activeSid ? (
          <div className="rounded-md border border-dashed border-[--color-border] bg-[--color-bg] p-3 text-sm text-[--color-muted]">
            {mode === 'improve'
              ? 'Describe a dashboard change and it will be queued as an automatic apply run.'
              : 'Ask a dashboard-wide question without attaching it to a comment thread.'}
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-[--color-border] bg-[--color-bg] p-3 text-sm text-[--color-muted]">
            This conversation is empty.
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <article key={message.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-[--color-muted]">
                  <span>{message.role === 'user' ? 'User' : message.role === 'assistant' ? 'Sagan' : 'System'}</span>
                  <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div
                  className={cn(
                    'rounded-md border px-2.5 py-2 text-sm',
                    message.role === 'user'
                      ? 'border-[--color-border] bg-[--color-muted-bg]'
                      : message.role === 'system'
                        ? 'border-[--color-danger] bg-[--color-bg] text-[--color-danger]'
                        : 'border-transparent bg-[--color-panel]',
                  )}
                >
                  {message.role === 'assistant' ? (
                    <Markdown className="text-sm">{cleanBody(message.body)}</Markdown>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{cleanBody(message.body)}</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="shrink-0 border-t border-[--color-border] px-3 py-2 text-xs text-[--color-danger]">{error}</p> : null}

      <form onSubmit={send} className="flex shrink-0 items-end gap-2 border-t border-[--color-border] p-3">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={2}
          disabled={sending}
          placeholder={mode === 'improve' ? 'Describe the dashboard change...' : 'Ask a question...'}
          className="min-h-10 flex-1 resize-none rounded-md border border-[--color-border] bg-[--color-bg] px-2.5 py-2 text-sm outline-none placeholder:text-[--color-muted] focus:ring-2 focus:ring-[--color-focus] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="rounded-md bg-[--color-accent] p-2 text-[--color-accent-fg] disabled:opacity-50"
          aria-label={mode === 'improve' ? 'Run dashboard improvement' : 'Send message'}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
