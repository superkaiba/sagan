'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Archive, MessageSquare, Plus, RotateCcw, Send, Wrench, X } from 'lucide-react';
import { Markdown } from '@/components/Markdown';
import { cn } from '@/lib/cn';
import styles from './ConversationDock.module.css';

type ConversationKind = 'chat' | 'improve';

type ConversationSession = {
  id: string;
  kind: ConversationKind;
  title: string;
  createdByEmail: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
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

type LoadSessionsOptions = {
  archived?: boolean;
  showLoading?: boolean;
};

type LoadMessagesOptions = {
  showLoading?: boolean;
};

const ACTIVE_STATUSES = new Set(['queued', 'running', 'approved', 'deploying', 'awaiting_approval']);
const MODE_STORAGE_KEY = 'sagan-conversation-dock-compose-mode';

function cleanBody(body: string | null) {
  return (body ?? '').replace(/^\[Dashboard improvement\]\s*/i, '').trim();
}

function cleanTitle(title: string) {
  return title.replace(/^Improve:\s*/i, '').trim() || 'New conversation';
}

function relativeTime(value: string | null | undefined) {
  if (!value) return 'new';
  const ms = Date.now() - new Date(value).getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

type StatusTone = 'info' | 'success' | 'danger' | 'muted';

function statusTone(status: string): StatusTone {
  if (ACTIVE_STATUSES.has(status)) return 'info';
  if (status === 'succeeded' || status === 'completed' || status === 'deployed') return 'success';
  if (status === 'failed' || status === 'errored' || status === 'cancelled') return 'danger';
  return 'muted';
}

const RUN_PILL_CLASS: Record<StatusTone, string> = {
  info: styles.runPillInfo!,
  success: styles.runPillSuccess!,
  danger: styles.runPillDanger!,
  muted: styles.runPillMuted!,
};

export function ConversationDock() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [composerMode, setComposerMode] = useState<ConversationKind>('chat');
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [activeSid, setActiveSid] = useState<string | null>(null);
  const [composingNew, setComposingNew] = useState(false);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [runs, setRuns] = useState<ConversationRun[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [updatingSessionId, setUpdatingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageRequestRef = useRef(0);

  const activeSession = sessions.find((session) => session.id === activeSid) ?? null;
  const activeRunCount = sessions.reduce((sum, session) => sum + session.activeRunCount, 0);
  const activeRuns = runs.filter((run) => ACTIVE_STATUSES.has(run.status));
  const composerLocked = Boolean(activeSession?.archivedAt);
  const canSend = Boolean(draft.trim()) && !sending && !composerLocked;
  const headerMeta = activeRunCount > 0
    ? `${activeRunCount} active run${activeRunCount === 1 ? '' : 's'}`
    : loadingSessions
      ? 'Loading conversations'
      : `${sessions.length} ${showArchived ? 'archived' : 'active'} conversation${sessions.length === 1 ? '' : 's'}`;

  const loadSessions = useCallback(
    async (options: LoadSessionsOptions = {}) => {
      const archived = options.archived ?? showArchived;
      if (options.showLoading) setLoadingSessions(true);

      const res = await fetch(`/api/conversations${archived ? '?archived=1' : ''}`, { cache: 'no-store' });
      if (!res.ok) {
        setLoadingSessions(false);
        return null;
      }

      const data = (await res.json()) as { sessions: ConversationSession[] };
      setSessions(data.sessions);
      setLoadingSessions(false);
      return data.sessions;
    },
    [showArchived],
  );

  const loadMessages = useCallback(async (sid: string, options: LoadMessagesOptions = {}) => {
    const requestId = messageRequestRef.current + 1;
    messageRequestRef.current = requestId;
    if (options.showLoading) setLoadingMessages(true);

    const res = await fetch(`/api/conversations/${sid}/messages`, { cache: 'no-store' });
    if (requestId !== messageRequestRef.current) return;
    if (!res.ok) {
      if (options.showLoading) {
        setMessages([]);
        setRuns([]);
      }
      setLoadingMessages(false);
      return;
    }

    const data = (await res.json()) as { messages: ConversationMessage[]; runs: ConversationRun[] };
    if (requestId !== messageRequestRef.current) return;
    setMessages(data.messages);
    setRuns(data.runs);
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      setOpen(window.localStorage.getItem('sagan-conversation-dock-open') === '1');
      const savedMode = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (savedMode === 'chat' || savedMode === 'improve') setComposerMode(savedMode);
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void loadSessions({ showLoading: true });
  }, [loadSessions, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const timer = window.setInterval(() => {
      void loadSessions();
      if (open && activeSid) void loadMessages(activeSid);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [activeSid, loadMessages, loadSessions, mounted, open]);

  useEffect(() => {
    if (composingNew) return;
    if (activeSid && sessions.some((session) => session.id === activeSid)) return;
    setActiveSid(sessions[0]?.id ?? null);
  }, [activeSid, composingNew, sessions]);

  useEffect(() => {
    if (!activeSid || !open) {
      messageRequestRef.current += 1;
      setMessages([]);
      setRuns([]);
      setLoadingMessages(false);
      return;
    }
    void loadMessages(activeSid, { showLoading: true });
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

  function updateComposerMode(next: ConversationKind) {
    setComposerMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {}
  }

  async function createSession(targetMode: ConversationKind) {
    if (showArchived) setShowArchived(false);
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: targetMode }),
    });
    if (!res.ok) throw new Error('conversation_create_failed');
    const data = (await res.json()) as { session: ConversationSession };
    setSessions((current) => [data.session, ...current.filter((session) => session.id !== data.session.id)]);
    setActiveSid(data.session.id);
    setComposingNew(false);
    return data.session.id;
  }

  async function startNew() {
    setError(null);
    setShowArchived(false);
    setActiveSid(null);
    setComposingNew(true);
    setMessages([]);
    setRuns([]);
  }

  function selectSession(session: ConversationSession) {
    setError(null);
    setComposingNew(false);
    setActiveSid(session.id);
    updateComposerMode(session.kind);
  }

  async function updateArchiveState(sid: string, archived: boolean) {
    setError(null);
    setUpdatingSessionId(sid);
    try {
      const res = await fetch(`/api/conversations/${sid}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'conversation_update_failed');
      }

      if (archived) {
        setSessions((current) => current.filter((session) => session.id !== sid));
        if (activeSid === sid) {
          setActiveSid(null);
          setMessages([]);
          setRuns([]);
        }
        await loadSessions({ archived: showArchived });
      } else {
        setShowArchived(false);
        setComposingNew(false);
        setActiveSid(sid);
        await loadSessions({ archived: false, showLoading: true });
        if (open) void loadMessages(sid, { showLoading: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'conversation_update_failed');
    } finally {
      setUpdatingSessionId(null);
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = draft.trim();
    if (!body || sending || composerLocked) return;
    setSending(true);
    setError(null);
    setDraft('');

    try {
      const sendMode = composerMode;
      const sid = activeSession?.id ?? (await createSession(sendMode));
      const optimistic: ConversationMessage = {
        id: `pending-${Date.now()}`,
        role: 'user',
        body: sendMode === 'improve' ? `[Dashboard improvement]\n${body}` : body,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);

      const res = await fetch(`/api/conversations/${sid}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: sendMode, body }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'send_failed');
      }
      await Promise.all([loadSessions({ archived: false }), loadMessages(sid)]);
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
        title="Open Sagan conversations"
        className={styles.launcher}
        aria-label="Open Sagan conversations"
        aria-expanded={false}
      >
        <MessageSquare className={styles.launcherIcon} />
        <span className={styles.launcherText}>Sagan conversations</span>
        {activeRunCount > 0 ? (
          <span className={styles.launcherCount} aria-hidden="true">
            {activeRunCount}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section className={styles.dock} aria-label="Sagan conversations">
      <div className={styles.header}>
        <span className={styles.headerMark} aria-hidden="true">
          <MessageSquare className={styles.headerIcon} />
        </span>
        <span className={styles.headerText}>
          <span className={styles.headerTitle}>Sagan conversations</span>
          <span className={styles.headerMeta}>{headerMeta}</span>
        </span>
        <button
          type="button"
          onClick={startNew}
          className={styles.newButton}
        >
          <Plus className={styles.buttonIcon} />
          New
        </button>
        <button
          type="button"
          onClick={() => updateOpen(false)}
          className={styles.iconButton}
          aria-label="Close conversations"
          aria-expanded={true}
        >
          <X className={styles.buttonIcon} />
        </button>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlRow}>
          <div className={styles.tabs} aria-label="Conversation list">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowArchived(false);
              }}
              className={cn(
                styles.tabButton,
                !showArchived ? styles.tabButtonActive : null,
              )}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowArchived(true);
              }}
              className={cn(
                styles.tabButton,
                showArchived ? styles.tabButtonActive : null,
              )}
            >
              Archived
            </button>
          </div>
          <div className={styles.modeSwitch} aria-label="Composer mode">
            <button
              type="button"
              onClick={() => updateComposerMode('chat')}
              className={cn(
                styles.modeButton,
                composerMode === 'chat' ? styles.modeButtonActive : null,
              )}
            >
              <MessageSquare className={styles.modeIcon} />
              Chat
            </button>
            <button
              type="button"
              onClick={() => updateComposerMode('improve')}
              className={cn(
                styles.modeButton,
                composerMode === 'improve' ? styles.modeButtonActive : null,
              )}
            >
              <Wrench className={styles.modeIcon} />
              Improve
            </button>
          </div>
        </div>

        <div className={styles.threadList}>
          {loadingSessions ? (
            <p className={styles.threadEmpty}>Loading...</p>
          ) : sessions.length === 0 ? (
            <p className={styles.threadEmpty}>
              {showArchived ? 'No archived conversations.' : 'No active conversations.'}
            </p>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSid && !composingNew;
              const runPillClass = session.latestRun ? RUN_PILL_CLASS[statusTone(session.latestRun.status)] : null;
              const archiveAction = showArchived ? 'Resume' : 'Archive';
              return (
                <div key={session.id} className={styles.threadRow}>
                  <button
                    type="button"
                    onClick={() => selectSession(session)}
                    className={cn(
                      styles.threadButton,
                      isActive ? styles.threadButtonActive : null,
                    )}
                  >
                    <span className={styles.threadTitleLine}>
                      {session.kind === 'improve' ? <Wrench className={styles.threadKindIcon} aria-hidden="true" /> : null}
                      <span className={styles.threadTitle}>{cleanTitle(session.title)}</span>
                    </span>
                    <span className={styles.threadMeta}>
                      {session.messageCount > 0 ? `${session.messageCount} msg${session.messageCount === 1 ? '' : 's'} · ` : null}
                      {relativeTime(session.archivedAt ?? session.lastMessageAt ?? session.createdAt)}
                    </span>
                    {session.latestRun && runPillClass ? (
                      <span className={cn(styles.runPill, runPillClass)}>
                        {session.latestRun.status}
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateArchiveState(session.id, !showArchived)}
                    disabled={updatingSessionId === session.id}
                    className={styles.threadAction}
                    aria-label={`${archiveAction} conversation`}
                    title={`${archiveAction} conversation`}
                  >
                    {showArchived ? <RotateCcw className={styles.threadActionIcon} /> : <Archive className={styles.threadActionIcon} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div ref={scrollRef} className={styles.messagePane}>
        {activeRuns.length > 0 ? (
          <div className={styles.runBanner}>
            <div className={styles.runBannerText}>
              {activeRuns.map((run) => (
                <p key={run.id}>
                  <span>{run.kind}</span>{' '}
                  run {run.id.slice(0, 8)} is {run.status}.
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {loadingMessages ? (
          <p className={styles.messageLoading}>Loading...</p>
        ) : !activeSid ? (
          <div className={styles.emptyState}>
            {composerMode === 'improve' ? 'New improvement' : 'New conversation'}
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            This conversation is empty.
          </div>
        ) : (
          <div className={styles.messageStack}>
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const isAssistant = message.role === 'assistant';
              const isSystem = message.role === 'system';
              const roleLabel = isUser ? 'User' : isAssistant ? 'Sagan' : 'System';
              return (
                <article
                  key={message.id}
                  className={cn(
                    styles.messageEntry,
                    isUser ? styles.messageUser : null,
                    isAssistant ? styles.messageAssistant : null,
                    isSystem ? styles.messageSystem : null,
                  )}
                >
                  <div className={styles.messageMeta}>
                    <span className={styles.messageRole}>{roleLabel}</span>
                    <span>
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={styles.messageBubble}>
                    {isAssistant ? (
                      <Markdown className="text-sm">{cleanBody(message.body)}</Markdown>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{cleanBody(message.body)}</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {error ? (
        <p className={styles.errorText}>
          {error}
        </p>
      ) : null}

      <form onSubmit={send} className={styles.composer}>
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
          disabled={sending || composerLocked}
          placeholder={
            composerLocked
              ? 'Resume this conversation to send messages.'
              : composerMode === 'improve'
                ? 'Describe the dashboard change...'
                : 'Message Sagan...'
          }
          className={styles.composerInput}
          aria-label={composerMode === 'improve' ? 'Dashboard improvement request' : 'Message Sagan'}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={styles.sendButton}
          aria-label={composerMode === 'improve' ? 'Run dashboard improvement' : 'Send message'}
        >
          <Send className={styles.sendIcon} />
        </button>
      </form>
    </section>
  );
}
