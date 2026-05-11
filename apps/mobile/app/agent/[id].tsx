import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

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

function formatRefreshTime(date: Date | null) {
  if (!date) return 'not refreshed yet';
  return `last refreshed ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function continuationSource(request: string) {
  return request.match(/\[auto-continuation-for:([^\]]+)\]/)?.[1] ?? null;
}

function formatAge(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<RunPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<string | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await api<RunPayload>(`/api/agent-runs/${id}`);
    if (r.ok && r.data) {
      setData(r.data);
      setLastRefreshedAt(new Date());
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
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
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
    const r = await api<{ prompt?: string; error?: string }>(`/api/agent-runs/${id}/codex-review`, {
      method: 'POST',
    });
    setReviewBusy(false);
    if (!r.ok || !r.data?.prompt) {
      setError(r.data?.error ?? r.error ?? 'Could not prepare Codex review prompt');
      return;
    }
    setReviewPrompt(r.data.prompt);
  }

  if (!data) {
    return (
      <View style={s.empty}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const { run, events } = data;
  const pods = data.pods ?? [];
  const artifacts = data.artifacts ?? [];
  const canManageRun = data.canManageRun === true;
  const showApproval =
    canManageRun && run.status === 'awaiting_approval' && (run.kind === 'plan' || run.kind === 'experiment');
  const hasActivePods = pods.some((pod) => ['deploying', 'running', 'retrying'].includes(pod.status));
  const sourceRunId = continuationSource(run.request);
  const continuationEvents = events.filter((e) => e.eventType === 'auto_continuation_queued');
  const latestContinuationId = continuationEvents.at(-1)?.body?.trim() ?? null;
  const latestEvent = events.at(-1);
  const latestAt =
    latestEvent?.createdAt ?? run.updatedAt ?? run.createdAt ?? null;
  const latestAgeMs = latestAt ? Date.now() - new Date(latestAt).getTime() : null;
  const stale =
    latestAgeMs !== null && ACTIVE_STATUSES.has(run.status) && latestAgeMs > 10 * 60 * 1000
      ? `No new run update for ${formatAge(latestAgeMs)}. Refresh; the runner may be stalled.`
      : null;

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ padding: 14, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />}
    >
      <View style={s.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Run {run.id.slice(0, 8)}</Text>
          <Text style={s.meta}>{formatRefreshTime(lastRefreshedAt)}</Text>
        </View>
        <TouchableOpacity disabled={refreshing} onPress={refresh} style={s.smallButton}>
          <Text style={s.smallButtonText}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.statusRow}>
        <Text style={s.kind}>{run.kind}</Text>
        <Text style={s.status}>{run.status}</Text>
        <Text style={s.eventCount}>{events.length} events</Text>
      </View>

      <Text style={s.request}>{run.request}</Text>

      {error ? <Text style={s.err}>{error}</Text> : null}
      {run.lastError ? <Text style={s.err}>{run.lastError}</Text> : null}
      {stale ? <Text style={s.notice}>{stale}</Text> : null}

      {sourceRunId || latestContinuationId ? (
        <View style={s.workflowCard}>
          <Text style={s.cardTitle}>Continuation</Text>
          {sourceRunId ? <Text style={s.workflowText}>Continues run {sourceRunId.slice(0, 8)}.</Text> : null}
          {latestContinuationId ? (
            <Text style={s.workflowText}>Queued continuation {latestContinuationId.slice(0, 8)}.</Text>
          ) : null}
        </View>
      ) : null}

      {pods.length || artifacts.length ? (
        <View style={s.workflowCard}>
          <View style={s.inlineHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>RunPod lifecycle</Text>
              <Text style={s.workflowText}>Stop preserves the attached volume.</Text>
            </View>
            {canManageRun && hasActivePods ? (
              <TouchableOpacity disabled={busy} onPress={stopRunPod} style={s.smallButton}>
                <Text style={s.smallButtonText}>{busy ? 'Stopping' : 'Stop'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {pods.map((pod) => (
            <View key={pod.id} style={s.podCard}>
              <View style={s.eventHeader}>
                <Text style={s.eventType}>{pod.runpodPodId}</Text>
                <Text style={s.eventTime}>{pod.status}</Text>
              </View>
              <Text style={s.workflowText}>
                {pod.gpuCount ?? '-'} x {pod.gpuTypeId ?? '-'} · {pod.desiredStatus ?? 'unknown'}
              </Text>
              <Text style={s.workflowText}>
                SSH {pod.sshHost && pod.sshPort ? `${pod.sshHost}:${pod.sshPort}` : '-'} · retries {pod.retryCount}/{pod.maxRetries}
              </Text>
              {pod.blockedReason || pod.lastError ? <Text style={s.err}>{pod.blockedReason ?? pod.lastError}</Text> : null}
            </View>
          ))}
          {artifacts.map((artifact) => (
            <Text key={artifact.id} style={s.workflowText}>
              {artifact.kind} · {artifact.status} · {artifact.uri}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={s.workflowCard}>
        <View style={s.inlineHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Codex review</Text>
            <Text style={s.workflowText}>Prepares a prompt only. It does not execute a review agent here.</Text>
          </View>
          <TouchableOpacity disabled={reviewBusy} onPress={prepareCodexReview} style={s.smallButton}>
            <Text style={s.smallButtonText}>{reviewBusy ? 'Preparing' : 'Prepare'}</Text>
          </TouchableOpacity>
        </View>
        {reviewPrompt ? (
          <Text selectable numberOfLines={12} style={s.promptText}>
            {reviewPrompt}
          </Text>
        ) : null}
      </View>

      {run.planMd ? (
        <View style={s.planCard}>
          <Text style={s.sectionLabel}>Plan</Text>
          {run.planJson?.sections?.length ? (
            <View style={s.sectionStack}>
              {run.planJson.sections.map((section) => (
                <View key={section.title} style={s.planSection}>
                  <Text style={s.planSectionTitle}>{section.title}</Text>
                  <Text style={s.planSectionBody}>{section.body}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={s.planText}>{run.planMd}</Text>
        </View>
      ) : null}

      {showApproval ? (
        <View style={s.actions}>
          <TouchableOpacity
            disabled={busy}
            onPress={() =>
              Alert.alert('Approve run?', 'This records approval and lets the workflow decide the next step.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Approve', style: 'destructive', onPress: () => decide('approve') },
              ])
            }
            style={[s.actionBtn, s.approve]}
          >
            <Text style={s.actionText}>{busy ? '…' : 'Approve'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={busy}
            onPress={() => decide('reject')}
            style={[s.actionBtn, s.reject]}
          >
            <Text style={[s.actionText, { color: C.fg }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={s.sectionLabel}>Events ({events.length})</Text>
      <View style={{ gap: 6 }}>
        {events.map((e) => (
          <View key={e.id} style={s.event}>
            <View style={s.eventHeader}>
              <Text style={s.eventType}>{e.eventType}</Text>
              <Text style={s.eventTime}>
                {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {e.body ? (
              <Text numberOfLines={4} style={s.eventBody}>
                {e.body}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <TouchableOpacity onPress={() => router.back()} style={[s.actionBtn, { backgroundColor: C.mutedBg }]}>
        <Text style={[s.actionText, { color: C.fg }]}>Back</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: C.fg },
  meta: { fontSize: 12, color: C.muted },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.mutedBg,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  kind: { fontSize: 11, fontWeight: '700', color: C.muted },
  status: { fontFamily: 'Courier', fontSize: 13, color: C.fg },
  eventCount: { marginLeft: 'auto', fontSize: 11, color: C.muted },
  request: { color: C.fg, fontSize: 14, lineHeight: 20 },
  err: { color: C.danger, fontSize: 13, lineHeight: 18 },
  notice: {
    backgroundColor: C.mutedBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    color: C.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  workflowCard: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  inlineHeader: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.fg },
  workflowText: { fontSize: 12, color: C.muted, lineHeight: 17 },
  podCard: {
    backgroundColor: C.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    gap: 4,
  },
  promptText: {
    fontFamily: 'Courier',
    fontSize: 11,
    color: C.fg,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    padding: 10,
    lineHeight: 16,
  },
  planCard: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  planText: { fontFamily: 'Courier', fontSize: 12, color: C.fg, lineHeight: 17 },
  sectionStack: { gap: 8, marginBottom: 8 },
  planSection: { backgroundColor: C.bg, borderRadius: 8, borderWidth: 1, borderColor: C.border, padding: 10 },
  planSectionTitle: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  planSectionBody: { color: C.fg, fontSize: 13, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 10 },
  smallButton: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.mutedBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  smallButtonText: { color: C.fg, fontSize: 12, fontWeight: '600' },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  approve: { backgroundColor: C.accent },
  reject: { backgroundColor: C.mutedBg, borderWidth: 1, borderColor: C.border },
  actionText: { fontWeight: '700', color: C.accentFg, fontSize: 15 },
  event: {
    backgroundColor: C.mutedBg,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  eventType: { fontFamily: 'Courier', fontSize: 11, color: C.fg, fontWeight: '600' },
  eventTime: { fontFamily: 'Courier', fontSize: 11, color: C.muted },
  eventBody: { fontFamily: 'Courier', fontSize: 11, color: C.fg, marginTop: 4 },
});
