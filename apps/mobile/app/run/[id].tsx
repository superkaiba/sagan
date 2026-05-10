import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import type { AgentRun } from '../../src/types';

type RunEvent = {
  id: string;
  runId: string;
  eventKind: string;
  payload: unknown;
  createdAt: string;
};

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected']);
const STATUS_COLOR: Record<string, string> = {
  queued: '#9ca3af',
  running: '#fbbf24',
  awaiting_approval: '#fb923c',
  approved: '#60a5fa',
  rejected: '#f87171',
  deploying: '#60a5fa',
  completed: '#22c55e',
  failed: '#f87171',
  cancelled: '#6b7280',
};

export default function RunDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<AgentRun | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    stoppedRef.current = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        const data = await api<{ run: AgentRun; events: RunEvent[] }>(`/api/agent-runs/${id}`);
        setRun(data.run);
        setEvents(data.events);
        if (TERMINAL.has(data.run.status)) return;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return;
      }
      timer = setTimeout(tick, 1500);
    };

    void tick();
    return () => {
      stoppedRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  async function approve() {
    if (!id) return;
    setActing('approve');
    try {
      await api(`/api/agent-runs/${id}/approve`, { method: 'POST' });
    } catch (err) {
      Alert.alert('Approve failed', err instanceof ApiError ? `status ${err.status}` : 'network error');
    } finally {
      setActing(null);
    }
  }

  async function reject() {
    if (!id) return;
    setActing('reject');
    try {
      await api(`/api/agent-runs/${id}/reject`, { method: 'POST' });
    } catch (err) {
      Alert.alert('Reject failed', err instanceof ApiError ? `status ${err.status}` : 'network error');
    } finally {
      setActing(null);
    }
  }

  if (!run) {
    return (
      <SafeAreaView style={styles.center} edges={['bottom']}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }

  const canDecide = run.status === 'awaiting_approval';

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.kind}>{run.kind}</Text>
          <Text style={[styles.status, { color: STATUS_COLOR[run.status] ?? '#9ca3af' }]}>
            {run.status}
          </Text>
        </View>
        <Text style={styles.request}>{run.request}</Text>

        {run.planMd ? (
          <View style={styles.planCard}>
            <Text style={styles.sectionLabel}>Plan</Text>
            <Text style={styles.planText}>{run.planMd}</Text>
          </View>
        ) : null}

        {canDecide ? (
          <View style={styles.actions}>
            <Pressable
              onPress={reject}
              disabled={acting !== null}
              style={({ pressed }) => [styles.reject, pressed && { opacity: 0.7 }]}
            >
              {acting === 'reject' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.rejectText}>Reject</Text>
              )}
            </Pressable>
            <Pressable
              onPress={approve}
              disabled={acting !== null}
              style={({ pressed }) => [styles.approve, pressed && { opacity: 0.7 }]}
            >
              {acting === 'approve' ? (
                <ActivityIndicator color="#0b0b0e" />
              ) : (
                <Text style={styles.approveText}>Approve</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Events ({events.length})</Text>
        {events.map((ev) => (
          <View key={ev.id} style={styles.event}>
            <Text style={styles.eventKind}>{ev.eventKind}</Text>
            <Text style={styles.eventPayload} numberOfLines={6}>
              {JSON.stringify(ev.payload, null, 2)}
            </Text>
            <Text style={styles.eventTs}>{ev.createdAt}</Text>
          </View>
        ))}

        {run.lastError ? (
          <View style={styles.errorCard}>
            <Text style={styles.sectionLabel}>Error</Text>
            <Text style={styles.errorText}>{run.lastError}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0e' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b0b0e' },
  body: { padding: 16, gap: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kind: { color: '#fff', fontSize: 18, fontWeight: '700', textTransform: 'uppercase' },
  status: { fontWeight: '700', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  request: { color: '#e5e7eb', fontSize: 15, lineHeight: 22 },
  planCard: { backgroundColor: '#15151a', borderRadius: 10, padding: 12, gap: 8 },
  sectionLabel: { color: '#9ca3af', fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  planText: { color: '#e5e7eb', fontSize: 14, lineHeight: 20, fontFamily: 'Menlo' },
  actions: { flexDirection: 'row', gap: 10 },
  reject: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#7f1d1d',
    alignItems: 'center',
  },
  rejectText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  approve: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  approveText: { color: '#0b0b0e', fontWeight: '600', fontSize: 16 },
  event: { backgroundColor: '#15151a', borderRadius: 8, padding: 10, gap: 4 },
  eventKind: { color: '#fbbf24', fontSize: 12, fontWeight: '600' },
  eventPayload: { color: '#d1d5db', fontSize: 12, fontFamily: 'Menlo' },
  eventTs: { color: '#6b7280', fontSize: 11 },
  errorCard: { backgroundColor: '#3f1d1d', borderRadius: 10, padding: 12, gap: 8 },
  errorText: { color: '#fecaca', fontSize: 14 },
});
