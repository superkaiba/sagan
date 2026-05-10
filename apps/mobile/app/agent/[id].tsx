import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
  lastError: string | null;
}
interface RunEvent {
  id: string;
  eventType: string;
  body: string | null;
  createdAt: string;
}
interface RunPayload {
  run: Run;
  events: RunEvent[];
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'rejected']);

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<RunPayload | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await api<RunPayload>(`/api/agent-runs/${id}`);
    if (r.ok && r.data) setData(r.data);
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

  if (!data) {
    return (
      <View style={s.empty}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const { run, events } = data;
  const showApproval = run.status === 'awaiting_approval' && (run.kind === 'plan' || run.kind === 'experiment');

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 14, gap: 12 }}>
      <View style={s.statusRow}>
        <Text style={s.kind}>{run.kind}</Text>
        <Text style={s.status}>{run.status}</Text>
      </View>

      <Text style={s.request}>{run.request}</Text>

      {run.lastError ? <Text style={s.err}>{run.lastError}</Text> : null}

      {run.planMd ? (
        <View style={s.planCard}>
          <Text style={s.sectionLabel}>Plan</Text>
          <Text style={s.planText}>{run.planMd}</Text>
        </View>
      ) : null}

      {showApproval ? (
        <View style={s.actions}>
          <TouchableOpacity
            disabled={busy}
            onPress={() =>
              Alert.alert('Approve plan?', 'The runner will execute this immediately.', [
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
  kind: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  status: { fontFamily: 'Courier', fontSize: 13, color: C.fg },
  request: { color: C.fg, fontSize: 14, lineHeight: 20 },
  err: { color: C.danger, fontSize: 13, lineHeight: 18 },
  planCard: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  planText: { fontFamily: 'Courier', fontSize: 12, color: C.fg, lineHeight: 17 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { flexDirection: 'row', gap: 10 },
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
