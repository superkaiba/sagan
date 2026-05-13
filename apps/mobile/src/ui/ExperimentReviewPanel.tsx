import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { radius, spacing, useTheme } from '@/lib/theme';
import { Button, Card, HStack, Input, Pill, Text, VStack } from './index';

export type ExperimentReviewStatus = 'reviewing' | 'followups_running';

interface FollowupComment {
  id: string;
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

interface ImproveStatus {
  unresolvedCommentCount: number;
  pendingRunId: string | null;
}

interface RowSelection {
  quick: boolean;
  todo: boolean;
}

interface CommentRow {
  id: string;
  kind: 'discussion' | 'ask_claude' | 'todo';
  body: string;
  resolvedAt: string | null;
  createdAt: string;
}

export function ExperimentReviewPanel({
  experimentId,
  status,
  onChanged,
}: {
  experimentId: string;
  status: ExperimentReviewStatus;
  onChanged?: () => void;
}) {
  const t = useTheme();
  const locked = status === 'followups_running';
  const [followups, setFollowups] = useState<FollowupComment[] | null>(null);
  const [improveStatus, setImproveStatus] = useState<ImproveStatus | null>(null);
  const [selection, setSelection] = useState<Record<string, RowSelection>>({});
  const [newBody, setNewBody] = useState('');
  const [submitting, setSubmitting] = useState<'improve' | 'todos' | 'done' | 'add' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadFollowups = useCallback(async () => {
    const r = await api<{ comments: CommentRow[] }>(
      `/api/comments?entityKind=experiment&entityId=${encodeURIComponent(experimentId)}`,
    );
    if (!isMountedRef.current || !r.ok || !r.data) return;
    const todos = r.data.comments
      .filter((c) => c.kind === 'todo' && !c.resolvedAt)
      .map((c) => ({ id: c.id, body: c.body, resolvedAt: c.resolvedAt, createdAt: c.createdAt }));
    setFollowups(todos);
  }, [experimentId]);

  const loadImproveStatus = useCallback(async () => {
    const r = await api<ImproveStatus>(`/api/experiments/${experimentId}/improve`);
    if (!isMountedRef.current || !r.ok || !r.data) return;
    setImproveStatus(r.data);
  }, [experimentId]);

  useEffect(() => {
    void loadFollowups();
    void loadImproveStatus();
    const handle = setInterval(() => {
      void loadFollowups();
      void loadImproveStatus();
    }, 6000);
    return () => clearInterval(handle);
  }, [loadFollowups, loadImproveStatus]);

  const selectedQuickIds = useMemo(
    () => Object.entries(selection).filter(([, s]) => s.quick).map(([id]) => id),
    [selection],
  );
  const selectedTodoIds = useMemo(
    () => Object.entries(selection).filter(([, s]) => s.todo).map(([id]) => id),
    [selection],
  );

  function toggle(id: string, field: 'quick' | 'todo') {
    setSelection((prev) => {
      const cur = prev[id] ?? { quick: false, todo: false };
      const next: RowSelection = { ...cur, [field]: !cur[field] };
      if (field === 'quick' && next.quick) next.todo = false;
      if (field === 'todo' && next.todo) next.quick = false;
      return { ...prev, [id]: next };
    });
  }

  async function addFollowup() {
    if (!newBody.trim() || locked) return;
    setSubmitting('add');
    setError(null);
    const r = await api<{ comment?: { id: string } }>(`/api/comments`, {
      method: 'POST',
      body: JSON.stringify({
        entityKind: 'experiment',
        entityId: experimentId,
        body: newBody.trim(),
        kind: 'todo',
      }),
    });
    setSubmitting(null);
    if (!r.ok) {
      setError(r.error ?? `Add failed (${r.status})`);
      return;
    }
    setNewBody('');
    void loadFollowups();
    onChanged?.();
  }

  async function submitImprove() {
    if (locked || submitting) return;
    setSubmitting('improve');
    setError(null);
    const r = await api(`/api/experiments/${experimentId}/improve`, {
      method: 'POST',
      body: JSON.stringify({ followupCommentIds: selectedQuickIds }),
    });
    setSubmitting(null);
    if (!r.ok) {
      setError(r.error ?? `Improve failed (${r.status})`);
      return;
    }
    setSelection({});
    void loadImproveStatus();
    void loadFollowups();
    onChanged?.();
  }

  async function submitTodos() {
    if (locked || submitting || selectedTodoIds.length === 0) return;
    setSubmitting('todos');
    setError(null);
    const r = await api(`/api/experiments/${experimentId}/queue-followups`, {
      method: 'POST',
      body: JSON.stringify({ followupCommentIds: selectedTodoIds }),
    });
    setSubmitting(null);
    if (!r.ok) {
      setError(r.error ?? `Queue followups failed (${r.status})`);
      return;
    }
    setSelection({});
    void loadFollowups();
    onChanged?.();
  }

  async function markDone() {
    if (locked || submitting) return;
    setSubmitting('done');
    setError(null);
    const r = await api(`/api/experiments/${experimentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'clean_result_drafting' }),
    });
    setSubmitting(null);
    if (!r.ok) {
      setError(r.error ?? `Mark done failed (${r.status})`);
      return;
    }
    Alert.alert('Done reviewing', 'Experiment moved to clean-result drafting.');
    onChanged?.();
  }

  if (followups === null) {
    return (
      <Card pad="md">
        <Text variant="footnote" tone="muted">
          Loading review state…
        </Text>
      </Card>
    );
  }

  return (
    <Card pad="base" gap="md" variant="outlined">
      <HStack justify="space-between">
        <HStack gap="sm">
          <Ionicons name="checkbox-outline" size={16} color={t.colors.accent} />
          <Text variant="bodyEmph">Review experiment</Text>
        </HStack>
        <Pill tone={locked ? 'warning' : 'info'}>{locked ? 'follow-ups running' : 'reviewing'}</Pill>
      </HStack>

      {locked ? (
        <Text variant="footnote" tone="muted">
          Follow-up children are running. Wait for them to finish before re-entering review.
        </Text>
      ) : (
        <Text variant="footnote" tone="muted">
          Pick follow-ups: <Text variant="footnote" tone="fg">Q</Text> = bundle into an Improve run.{' '}
          <Text variant="footnote" tone="fg">T</Text> = spawn a child experiment.
        </Text>
      )}

      <VStack gap="sm">
        {followups.length === 0 ? (
          <Text variant="caption" tone="muted">
            No open follow-ups.
          </Text>
        ) : (
          followups.map((f) => {
            const sel = selection[f.id] ?? { quick: false, todo: false };
            return (
              <Card key={f.id} variant="sunken" pad="md" gap="sm">
                <Text variant="footnote">{f.body}</Text>
                <HStack gap="sm">
                  <Pressable
                    onPress={() => toggle(f.id, 'quick')}
                    disabled={locked}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.sm,
                      backgroundColor: sel.quick ? t.colors.accentSoft : 'transparent',
                      borderWidth: 1,
                      borderColor: sel.quick ? t.colors.accent : t.colors.hairline,
                      opacity: locked ? 0.5 : 1,
                    }}
                  >
                    <Ionicons
                      name={sel.quick ? 'checkbox' : 'square-outline'}
                      size={14}
                      color={sel.quick ? t.colors.accent : t.colors.mutedFg}
                    />
                    <Text
                      variant="caption"
                      tone={sel.quick ? 'accent' : 'muted'}
                      style={{ fontWeight: '600' }}
                    >
                      Q
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => toggle(f.id, 'todo')}
                    disabled={locked}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingHorizontal: spacing.sm,
                      paddingVertical: 4,
                      borderRadius: radius.sm,
                      backgroundColor: sel.todo ? t.colors.accentSoft : 'transparent',
                      borderWidth: 1,
                      borderColor: sel.todo ? t.colors.accent : t.colors.hairline,
                      opacity: locked ? 0.5 : 1,
                    }}
                  >
                    <Ionicons
                      name={sel.todo ? 'checkbox' : 'square-outline'}
                      size={14}
                      color={sel.todo ? t.colors.accent : t.colors.mutedFg}
                    />
                    <Text
                      variant="caption"
                      tone={sel.todo ? 'accent' : 'muted'}
                      style={{ fontWeight: '600' }}
                    >
                      T
                    </Text>
                  </Pressable>
                </HStack>
              </Card>
            );
          })
        )}
      </VStack>

      {!locked ? (
        <VStack gap="sm">
          <Input
            placeholder="Add a follow-up…"
            value={newBody}
            onChangeText={setNewBody}
            multiline
          />
          <Button
            label="Add follow-up"
            variant="secondary"
            size="sm"
            disabled={submitting !== null || !newBody.trim()}
            loading={submitting === 'add'}
            onPress={() => void addFollowup()}
          />
        </VStack>
      ) : null}

      {improveStatus?.pendingRunId ? (
        <Card variant="sunken" pad="md">
          <Text variant="footnote" tone="muted">
            Improve run in flight — Q-selections are queued behind it.
          </Text>
        </Card>
      ) : null}

      <View style={{ height: 1, backgroundColor: t.colors.hairline }} />

      <VStack gap="sm">
        <Button
          label={`Submit Q (${selectedQuickIds.length}) → Improve`}
          onPress={() => void submitImprove()}
          disabled={locked || submitting !== null}
          loading={submitting === 'improve'}
          fullWidth
        />
        <Button
          label={`Submit T (${selectedTodoIds.length}) → Spawn children`}
          variant="secondary"
          onPress={() => void submitTodos()}
          disabled={locked || submitting !== null || selectedTodoIds.length === 0}
          loading={submitting === 'todos'}
          fullWidth
        />
        <Button
          label="Done reviewing → Draft clean result"
          variant="secondary"
          onPress={() => void markDone()}
          disabled={locked || submitting !== null}
          loading={submitting === 'done'}
          fullWidth
        />
      </VStack>

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
    </Card>
  );
}
