import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { radius, spacing, useTheme } from '@/lib/theme';
import { Button, Card, HStack, Input, Pill, type PillTone, Text, VStack } from './index';

export type AuthorKind = 'human' | 'claude' | 'codex' | 'system';
export type CommentKind = 'discussion' | 'ask_claude' | 'todo';

export interface CommentRow {
  id: string;
  entityKind: string;
  entityId: string;
  parentCommentId: string | null;
  authorUserId: string | null;
  authorKind: AuthorKind;
  kind: CommentKind;
  body: string;
  anchoredQuote: string | null;
  mentions: string[] | null;
  agentRunId: string | null;
  agentRunStatus: string | null;
  agentRunKind: string | null;
  agentRunRequest: string | null;
  autoContinueClaude: boolean;
  resolvedAt: string | null;
  createdAt: string;
  authorEmail: string | null;
  authorDisplayName: string | null;
}

interface CommentsResponse {
  comments: CommentRow[];
  viewerUserId: string;
}

const AGENT_STATUS_TONE: Record<string, PillTone> = {
  queued: 'info',
  running: 'warning',
  awaiting_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  deploying: 'info',
  blocked: 'danger',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

function authorLabel(c: CommentRow): { label: string; tone: PillTone } {
  if (c.authorKind === 'claude') return { label: 'Claude', tone: 'accent' };
  if (c.authorKind === 'codex') return { label: 'Codex', tone: 'accent' };
  if (c.authorKind === 'system') return { label: 'System', tone: 'neutral' };
  return {
    label: c.authorDisplayName || c.authorEmail || 'You',
    tone: 'info',
  };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const ts = d.getTime();
  if (!Number.isFinite(ts)) return '—';
  const diffMin = Math.floor((Date.now() - ts) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString('en-US');
}

function stripCodexMarker(body: string): string {
  return body.replace(/^<!-- agent:codex -->\s*/, '');
}

interface CommentsProps {
  entityKind: string;
  entityId: string;
  /** Filter out kind='todo' comments — used on experiment review panels where todos render separately. */
  excludeTodos?: boolean;
  /** Optional placeholder for the input box. */
  placeholder?: string;
  /** Auto-poll for new replies every N seconds. Defaults to 8s on focus. */
  pollMs?: number;
}

export function Comments({
  entityKind,
  entityId,
  excludeTodos = true,
  placeholder = 'Add a comment. Use @claude or @codex to ask.',
  pollMs = 8000,
}: CommentsProps) {
  const t = useTheme();
  const [comments, setComments] = useState<CommentRow[] | null>(null);
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const epochRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Epoch-keyed: a stale response from the background poll never overwrites a
  // newer foreground reload (e.g. post-submit) and vice-versa.
  const load = useCallback(
    async (silent = false) => {
      const epoch = ++epochRef.current;
      const r = await api<CommentsResponse>(
        `/api/comments?entityKind=${encodeURIComponent(entityKind)}&entityId=${encodeURIComponent(entityId)}`,
      );
      if (!isMountedRef.current || epoch !== epochRef.current) return;
      if (r.ok && r.data) {
        setComments(r.data.comments);
        if (!silent) setError(null);
      } else if (!silent && r.error !== 'aborted') {
        setError(r.error ?? `Failed to load comments (${r.status})`);
      }
    },
    [entityKind, entityId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (pollMs <= 0) return;
    const handle = setInterval(() => {
      void load(true);
    }, pollMs);
    return () => clearInterval(handle);
  }, [load, pollMs]);

  async function submit(askAgent?: 'Claude' | 'Codex') {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    const finalBody = askAgent && !/^@(claude|codex)/i.test(text) ? `@${askAgent.toLowerCase()} ${text}` : text;
    const r = await api<{ comment?: CommentRow }>('/api/comments', {
      method: 'POST',
      body: JSON.stringify({
        entityKind,
        entityId,
        body: finalBody,
        ...(askAgent ? { askAgent } : {}),
      }),
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? `Send failed (${r.status})`);
      return;
    }
    setBody('');
    void load(true);
  }

  if (comments === null) {
    return (
      <VStack gap="md">
        <Text variant="title3">Conversation</Text>
        {error ? (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        ) : (
          <Text variant="footnote" tone="muted">
            Loading…
          </Text>
        )}
      </VStack>
    );
  }

  const visible = comments.filter((c) => !excludeTodos || c.kind !== 'todo');

  return (
    <VStack gap="md">
      <HStack justify="space-between">
        <Text variant="title3">Conversation</Text>
        <Text variant="caption" tone="subtle">
          {visible.length}
        </Text>
      </HStack>

      {visible.length === 0 ? (
        <Text variant="footnote" tone="muted">
          No comments yet. Tap @claude or @codex to start a thread.
        </Text>
      ) : null}

      {visible.map((c) => {
        const author = authorLabel(c);
        const isAgent = c.authorKind === 'claude' || c.authorKind === 'codex';
        const askPending =
          c.kind === 'ask_claude' &&
          c.agentRunStatus &&
          !['completed', 'failed', 'cancelled', 'rejected'].includes(c.agentRunStatus);
        return (
          <Card
            key={c.id}
            variant={isAgent ? 'sunken' : 'flat'}
            pad="md"
            gap="sm"
            style={
              c.parentCommentId
                ? { marginLeft: spacing.lg, borderLeftWidth: 2, borderLeftColor: t.colors.hairline }
                : undefined
            }
          >
            <HStack justify="space-between">
              <HStack gap="sm">
                <Pill tone={author.tone}>{author.label}</Pill>
                {c.kind === 'ask_claude' && c.agentRunStatus ? (
                  <Pill tone={AGENT_STATUS_TONE[c.agentRunStatus] ?? 'neutral'}>
                    {c.agentRunStatus.replace('_', ' ')}
                  </Pill>
                ) : null}
              </HStack>
              <Text variant="caption" tone="subtle">
                {formatTime(c.createdAt)}
              </Text>
            </HStack>
            {c.anchoredQuote ? (
              <View
                style={{
                  backgroundColor: t.colors.sunken,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                  borderRadius: radius.sm,
                  borderLeftWidth: 2,
                  borderLeftColor: t.colors.accent,
                }}
              >
                <Text variant="caption" tone="muted" numberOfLines={3}>
                  “{c.anchoredQuote}”
                </Text>
              </View>
            ) : null}
            <Text variant="body">{stripCodexMarker(c.body)}</Text>
            {askPending ? (
              <HStack gap="xs">
                <Ionicons name="sparkles-outline" size={12} color={t.colors.mutedFg} />
                <Text variant="caption" tone="muted">
                  Agent working — reply will appear here.
                </Text>
              </HStack>
            ) : null}
          </Card>
        );
      })}

      <VStack gap="sm">
        <Input
          placeholder={placeholder}
          value={body}
          onChangeText={setBody}
          multiline
        />
        {error ? (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        ) : null}
        <HStack gap="sm" wrap>
          <Button
            label="Send"
            onPress={() => void submit()}
            disabled={submitting || body.trim().length === 0}
            loading={submitting}
            size="sm"
          />
          <Button
            label="@claude"
            variant="secondary"
            size="sm"
            disabled={submitting || body.trim().length === 0}
            onPress={() => void submit('Claude')}
          />
          <Button
            label="@codex"
            variant="secondary"
            size="sm"
            disabled={submitting || body.trim().length === 0}
            onPress={() => void submit('Codex')}
          />
        </HStack>
      </VStack>
    </VStack>
  );
}

interface AskClaudeAboutPaperProps {
  litItemId: string;
  paperTitle: string;
  onSent?: () => void;
}

const PAPER_SUGGESTIONS = [
  'Summarize the contribution in 3 bullets.',
  'How does this relate to my current research?',
  'What experiments would test the central claim?',
  'What are the weakest assumptions in the paper?',
];

export function AskClaudeAboutPaper({ litItemId, paperTitle, onSent }: AskClaudeAboutPaperProps) {
  const t = useTheme();
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setError(null);
    const r = await api<{ comment?: CommentRow }>('/api/comments', {
      method: 'POST',
      body: JSON.stringify({
        entityKind: 'lit_item',
        entityId: litItemId,
        body: `@claude ${text}`,
        askAgent: 'Claude',
      }),
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error ?? `Send failed (${r.status})`);
      return;
    }
    setBody('');
    Alert.alert('Asked Claude', 'Reply will appear in the conversation below.');
    onSent?.();
  }

  return (
    <Card pad="base" gap="md" variant="outlined">
      <HStack gap="sm">
        <Ionicons name="sparkles" size={16} color={t.colors.accent} />
        <Text variant="bodyEmph">Ask Claude about this paper</Text>
      </HStack>
      <Text variant="footnote" tone="muted">
        Posts a comment with <Text variant="mono">@claude</Text> scoped to{' '}
        <Text variant="footnote" tone="fg">
          {paperTitle || 'this paper'}
        </Text>
        . Replies land in the conversation.
      </Text>
      <Input
        placeholder="What do you want to ask?"
        value={body}
        onChangeText={setBody}
        multiline
      />
      <HStack gap="xs" wrap>
        {PAPER_SUGGESTIONS.map((s) => (
          <Card
            key={s}
            variant="sunken"
            pad="xs"
            onPress={() => setBody(s)}
            style={{ paddingHorizontal: spacing.sm, paddingVertical: 4 }}
          >
            <Text variant="caption" tone="muted">
              {s}
            </Text>
          </Card>
        ))}
      </HStack>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
      <Button
        label={submitting ? 'Asking…' : 'Ask Claude'}
        onPress={() => void submit()}
        disabled={submitting || body.trim().length === 0}
        loading={submitting}
        icon="sparkles-outline"
        fullWidth
      />
    </Card>
  );
}
