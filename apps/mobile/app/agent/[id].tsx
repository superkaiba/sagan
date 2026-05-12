import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  EmptyState,
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
const POLL_INTERVAL_MS = 2_500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type Action = 'approve' | 'reject' | 'stop' | 'review' | null;

function continuationSource(request: string): string | null {
  const match = request.match(/\[auto-continuation-for:([^\]]+)\]/)?.[1];
  if (!match) return null;
  // Avoid user-controlled spoofing of the badge: only display values that
  // look like a real run id.
  return UUID_RE.test(match) ? match : null;
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms)) return '?';
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

export default function RunDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<RunPayload | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [inflight, setInflight] = useState<Action>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<string | null>(null);
  const lastStatusRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const r = await api<RunPayload>(`/api/agent-runs/${id}`, { signal: controller.signal });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data) {
      setData(r.data);
      setError(null);
    } else if (r.error !== 'aborted') {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
    setLoaded(true);
    setRefreshing(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    if (TERMINAL.has(data.run.status)) return;
    const interval = setInterval(() => {
      void load();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [data, load]);

  // Reset cached review prompt whenever the run transitions to a new status,
  // so a stale prompt doesn't linger after the run progresses or restarts.
  useEffect(() => {
    const next = data?.run.status ?? null;
    if (lastStatusRef.current !== null && lastStatusRef.current !== next) {
      setReviewPrompt(null);
    }
    lastStatusRef.current = next;
  }, [data?.run.status]);

  async function decide(decision: 'approve' | 'reject') {
    if (!id) return;
    setInflight(decision);
    const r = await api(`/api/agent-runs/${id}/${decision}`, { method: 'POST' });
    if (!isMountedRef.current) return;
    setInflight(null);
    if (!r.ok) {
      Alert.alert('Error', `Could not ${decision}`);
      return;
    }
    void load();
  }

  async function stopRunPod() {
    if (!id) return;
    setInflight('stop');
    const r = await api(`/api/agent-runs/${id}/runpod/stop`, { method: 'POST' });
    if (!isMountedRef.current) return;
    setInflight(null);
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
    setInflight('review');
    setError(null);
    const r = await api<{ prompt?: string; error?: string }>(
      `/api/agent-runs/${id}/codex-review`,
      { method: 'POST' },
    );
    if (!isMountedRef.current) return;
    setInflight(null);
    if (!r.ok || !r.data?.prompt) {
      setError(r.data?.error ?? r.error ?? 'Could not prepare Codex review prompt');
      return;
    }
    setReviewPrompt(r.data.prompt);
  }

  if (!loaded) {
    return (
      <>
        <Stack.Screen options={{ title: 'Run' }} />
        <LoadingState />
      </>
    );
  }

  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Run' }} />
        <EmptyState
          icon="alert-circle-outline"
          title="Couldn't load run"
          message={error ?? 'The run may have been removed or is not reachable.'}
          action={<Button label="Retry" onPress={refresh} loading={refreshing} />}
        />
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
  const latestTime = latestAt ? new Date(latestAt).getTime() : null;
  const latestAgeMs =
    latestTime !== null && Number.isFinite(latestTime) ? Date.now() - latestTime : null;
  const stale =
    latestAgeMs !== null && ACTIVE_STATUSES.has(run.status) && latestAgeMs > 10 * 60 * 1000
      ? `Idle for ${formatAge(latestAgeMs)}. Refresh; the runner may be stalled.`
      : null;
  const planHasSections = (run.planJson?.sections?.length ?? 0) > 0;

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
                label={inflight === 'approve' ? 'Approving…' : 'Approve'}
                fullWidth
                size="lg"
                loading={inflight === 'approve'}
                disabled={inflight !== null}
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
                label={inflight === 'reject' ? 'Rejecting…' : 'Reject'}
                variant="secondary"
                fullWidth
                size="lg"
                loading={inflight === 'reject'}
                disabled={inflight !== null}
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
                  label={inflight === 'stop' ? 'Stopping…' : 'Stop'}
                  size="sm"
                  variant="ghost"
                  loading={inflight === 'stop'}
                  disabled={inflight !== null}
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
              label={inflight === 'review' ? 'Preparing…' : 'Prepare prompt'}
              size="sm"
              variant="ghost"
              loading={inflight === 'review'}
              disabled={inflight !== null && inflight !== 'review'}
              onPress={prepareCodexReview}
            />
          </HStack>
          <Text variant="caption" tone="muted">
            Prepares a prompt only. It does not execute a review agent.
          </Text>
          {reviewPrompt ? (
            <Card variant="sunken" pad="md" gap="sm">
              <Text variant="mono" selectable numberOfLines={12}>
                {reviewPrompt}
              </Text>
              <HStack justify="flex-end">
                <Button
                  label="Copy"
                  icon="copy-outline"
                  size="sm"
                  variant="ghost"
                  onPress={async () => {
                    await Clipboard.setStringAsync(reviewPrompt);
                    Alert.alert('Copied', 'Review prompt copied to clipboard.');
                  }}
                />
              </HStack>
            </Card>
          ) : null}
        </Card>

        {run.planMd || planHasSections ? (
          <Card pad="base" gap="md">
            <SectionLabel>Plan</SectionLabel>
            {planHasSections ? (
              <VStack gap="sm">
                {run.planJson!.sections!.map((section) => (
                  <Card key={section.title} variant="sunken" pad="md" gap="xs">
                    <Text variant="micro" tone="muted">
                      {section.title}
                    </Text>
                    <Text variant="footnote">{section.body}</Text>
                  </Card>
                ))}
              </VStack>
            ) : run.planMd ? (
              <Text variant="mono">{run.planMd}</Text>
            ) : null}
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
              <View key={e.id ?? `evt-${idx}`}>
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
