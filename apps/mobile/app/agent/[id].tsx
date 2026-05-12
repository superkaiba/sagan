import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  HStack,
  LoadingState,
  Pill,
  type PillTone,
  ScrollScreen,
  SectionLabel,
  Separator,
  Text,
  VStack,
} from '@/ui';

interface Run {
  id: string;
  kind: 'plan' | 'apply' | 'qa' | 'experiment';
  status: string;
  request: string;
  planMd: string | null;
  planJson: StructuredPlan | null;
  lastError: string | null;
  createdAt?: string;
  updatedAt?: string;
}
interface StructuredPlan {
  sections?: Array<{ title: string; body: string }>;
}
interface RunEvent {
  id: string;
  eventType: string;
  body: string | null;
  createdAt: string;
}
interface RunPodLifecycle {
  id: string;
  runpodPodId: string;
  status: string;
  desiredStatus: string | null;
  gpuTypeId: string | null;
  gpuCount: number | null;
  sshHost: string | null;
  sshPort: number | null;
  retryCount: number;
  maxRetries: number;
  blockedReason: string | null;
  lastError: string | null;
}
interface RunArtifact {
  id: string;
  kind: string;
  uri: string;
  status: string;
}
interface RunPayload {
  run: Run;
  events: RunEvent[];
  pods?: RunPodLifecycle[];
  artifacts?: RunArtifact[];
  canManageRun?: boolean;
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected', 'blocked']);
const ACTIVE_STATUSES = new Set(['queued', 'running', 'approved', 'deploying']);

const STATUS_TONE: Record<string, PillTone> = {
  queued: 'neutral',
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

function continuationSource(request: string) {
  return request.match(/\[auto-continuation-for:([^\]]+)\]/)?.[1] ?? null;
}

function formatAge(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function RunDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<RunPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await api<RunPayload>(`/api/agent-runs/${id}`);
    if (r.ok && r.data) {
      setData(r.data);
      setError(null);
    } else {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (TERMINAL.has(data.run.status)) return;
    const interval = setInterval(load, 2500);
    return () => clearInterval(interval);
  }, [data, load]);

  async function decide(decision: 'approve' | 'reject') {
    if (!id) return;
    setBusy(true);
    const r = await api(`/api/agent-runs/${id}/${decision}`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      Alert.alert('Error', `Could not ${decision}`);
      return;
    }
    void load();
  }

  async function stopRunPod() {
    if (!id) return;
    setBusy(true);
    const r = await api(`/api/agent-runs/${id}/runpod/stop`, { method: 'POST' });
    setBusy(false);
    if (!r.ok) {
      Alert.alert('Error', 'Could not stop RunPod pods');
      return;
    }
    void load();
  }

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  async function prepareCodexReview() {
    if (!id) return;
    setReviewBusy(true);
    setError(null);
    const r = await api<{ prompt?: string; error?: string }>(
      `/api/agent-runs/${id}/codex-review`,
      { method: 'POST' },
    );
    setReviewBusy(false);
    if (!r.ok || !r.data?.prompt) {
      setError(r.data?.error ?? r.error ?? 'Could not prepare Codex review prompt');
      return;
    }
    setReviewPrompt(r.data.prompt);
  }

  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Run' }} />
        <LoadingState />
      </>
    );
  }

  const { run, events } = data;
  const pods = data.pods ?? [];
  const artifacts = data.artifacts ?? [];
  const canManageRun = data.canManageRun === true;
  const showApproval =
    canManageRun &&
    run.status === 'awaiting_approval' &&
    (run.kind === 'plan' || run.kind === 'experiment');
  const hasActivePods = pods.some((pod) => ['deploying', 'running', 'retrying'].includes(pod.status));
  const sourceRunId = continuationSource(run.request);
  const continuationEvents = events.filter((e) => e.eventType === 'auto_continuation_queued');
  const latestContinuationId = continuationEvents.at(-1)?.body?.trim() ?? null;
  const latestEvent = events.at(-1);
  const latestAt = latestEvent?.createdAt ?? run.updatedAt ?? run.createdAt ?? null;
  const latestAgeMs = latestAt ? Date.now() - new Date(latestAt).getTime() : null;
  const stale =
    latestAgeMs !== null && ACTIVE_STATUSES.has(run.status) && latestAgeMs > 10 * 60 * 1000
      ? `Idle for ${formatAge(latestAgeMs)}. Refresh; the runner may be stalled.`
      : null;

  return (
    <>
      <Stack.Screen options={{ title: `Run ${run.id.slice(0, 8)}` }} />
      <ScrollScreen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.colors.accent} />
        }
      >
        <Card pad="lg" gap="md">
          <HStack gap="sm" wrap>
            <Pill tone={STATUS_TONE[run.status] ?? 'neutral'}>{run.status.replace('_', ' ')}</Pill>
            <Pill tone="neutral">{run.kind}</Pill>
            <Text variant="caption" tone="subtle" style={{ marginLeft: 'auto' }}>
              {events.length} events
            </Text>
          </HStack>
          <Text variant="body">{run.request}</Text>
          {run.lastError ? (
            <Text variant="footnote" tone="danger">
              {run.lastError}
            </Text>
          ) : null}
          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}
          {stale ? (
            <Text variant="footnote" tone="warning">
              {stale}
            </Text>
          ) : null}
        </Card>

        {showApproval ? (
          <HStack gap="sm">
            <View style={{ flex: 1 }}>
              <Button
                label={busy ? '…' : 'Approve'}
                fullWidth
                size="lg"
                disabled={busy}
                onPress={() =>
                  Alert.alert(
                    'Approve run?',
                    'This records approval and lets the workflow decide the next step.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Approve', onPress: () => decide('approve') },
                    ],
                  )
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Reject"
                variant="secondary"
                fullWidth
                size="lg"
                disabled={busy}
                onPress={() => decide('reject')}
              />
            </View>
          </HStack>
        ) : null}

        {sourceRunId || latestContinuationId ? (
          <Card pad="base" gap="xs">
            <SectionLabel>Continuation</SectionLabel>
            {sourceRunId ? (
              <Text variant="footnote" tone="muted">
                Continues run {sourceRunId.slice(0, 8)}.
              </Text>
            ) : null}
            {latestContinuationId ? (
              <Text variant="footnote" tone="muted">
                Queued continuation {latestContinuationId.slice(0, 8)}.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {pods.length || artifacts.length ? (
          <Card pad="base" gap="md">
            <HStack justify="space-between">
              <SectionLabel>RunPod lifecycle</SectionLabel>
              {canManageRun && hasActivePods ? (
                <Button
                  label={busy ? 'Stopping…' : 'Stop'}
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onPress={stopRunPod}
                />
              ) : null}
            </HStack>
            <Text variant="caption" tone="muted">
              Stop preserves the attached volume.
            </Text>
            <VStack gap="sm">
              {pods.map((pod) => (
                <Card key={pod.id} variant="sunken" pad="md" gap="xs">
                  <HStack justify="space-between">
                    <Text variant="footnote" style={{ fontWeight: '600' }}>
                      {pod.runpodPodId}
                    </Text>
                    <Pill tone="info">{pod.status}</Pill>
                  </HStack>
                  <Text variant="caption" tone="muted">
                    {pod.gpuCount ?? '-'} × {pod.gpuTypeId ?? '-'} · {pod.desiredStatus ?? 'unknown'}
                  </Text>
                  <Text variant="caption" tone="muted">
                    SSH {pod.sshHost && pod.sshPort ? `${pod.sshHost}:${pod.sshPort}` : '—'} ·
                    retries {pod.retryCount}/{pod.maxRetries}
                  </Text>
                  {pod.blockedReason || pod.lastError ? (
                    <Text variant="caption" tone="danger">
                      {pod.blockedReason ?? pod.lastError}
                    </Text>
                  ) : null}
                </Card>
              ))}
              {artifacts.length ? (
                <VStack gap="xs" style={{ marginTop: spacing.xs }}>
                  <SectionLabel>Artifacts</SectionLabel>
                  {artifacts.map((a) => (
                    <Text key={a.id} variant="caption" tone="muted">
                      {a.kind} · {a.status} · {a.uri}
                    </Text>
                  ))}
                </VStack>
              ) : null}
            </VStack>
          </Card>
        ) : null}

        <Card pad="base" gap="sm">
          <HStack justify="space-between">
            <SectionLabel>Codex review</SectionLabel>
            <Button
              label={reviewBusy ? 'Preparing…' : 'Prepare prompt'}
              size="sm"
              variant="ghost"
              loading={reviewBusy}
              onPress={prepareCodexReview}
            />
          </HStack>
          <Text variant="caption" tone="muted">
            Prepares a prompt only. It does not execute a review agent.
          </Text>
          {reviewPrompt ? (
            <Card variant="sunken" pad="md">
              <Text variant="mono" selectable numberOfLines={12}>
                {reviewPrompt}
              </Text>
            </Card>
          ) : null}
        </Card>

        {run.planMd ? (
          <Card pad="base" gap="md">
            <SectionLabel>Plan</SectionLabel>
            {run.planJson?.sections?.length ? (
              <VStack gap="sm">
                {run.planJson.sections.map((section) => (
                  <Card key={section.title} variant="sunken" pad="md" gap="xs">
                    <Text variant="micro" tone="muted">
                      {section.title}
                    </Text>
                    <Text variant="footnote">{section.body}</Text>
                  </Card>
                ))}
              </VStack>
            ) : null}
            <Text variant="mono">{run.planMd}</Text>
          </Card>
        ) : null}

        <Card pad="base" gap="sm">
          <HStack justify="space-between">
            <SectionLabel>Events</SectionLabel>
            <Text variant="caption" tone="subtle">
              {events.length}
            </Text>
          </HStack>
          <VStack gap="sm">
            {events.map((e, idx) => (
              <View key={e.id}>
                {idx > 0 ? <Separator style={{ marginBottom: spacing.sm }} /> : null}
                <HStack justify="space-between">
                  <Text variant="footnote" style={{ fontWeight: '600' }}>
                    {e.eventType}
                  </Text>
                  <Text variant="caption" tone="subtle">
                    {formatTime(e.createdAt)}
                  </Text>
                </HStack>
                {e.body ? (
                  <Text variant="mono" numberOfLines={4} style={{ marginTop: 4 }}>
                    {e.body}
                  </Text>
                ) : null}
              </View>
            ))}
          </VStack>
        </Card>
      </ScrollScreen>
    </>
  );
}
