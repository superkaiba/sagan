import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

interface AgentRun {
  id: string;
  kind: 'plan' | 'apply' | 'qa' | 'experiment';
  status:
    | 'queued'
    | 'running'
    | 'awaiting_approval'
    | 'approved'
    | 'rejected'
    | 'deploying'
    | 'completed'
    | 'failed'
    | 'cancelled';
  request: string;
  createdAt: string;
}

const STATUS_BG: Record<string, string> = {
  queued: '#dde1ee',
  running: '#fde9b5',
  awaiting_approval: '#ffd9a8',
  approved: '#c4f0d3',
  deploying: '#bdd4f5',
  completed: '#bff0c9',
  failed: '#f5c0c8',
  cancelled: '#dadde4',
  rejected: '#ffc6c6',
};

export default function AgentList() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ runs: AgentRun[] }>('/api/agent-runs?limit=50');
    if (r.ok && r.data) setRuns(r.data.runs);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={s.root}>
      <Link href="/agent/new" asChild>
        <TouchableOpacity style={s.dispatchButton}>
          <Text style={s.dispatchText}>+ Dispatch</Text>
        </TouchableOpacity>
      </Link>

      {loading && runs.length === 0 ? (
        <View style={s.empty}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ padding: 12, gap: 8 }}
          data={runs}
          keyExtractor={(r) => r.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={C.accent}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ color: C.muted }}>No runs yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Link href={`/agent/${item.id}`} asChild>
              <TouchableOpacity style={s.row}>
                <View style={[s.statusBadge, { backgroundColor: STATUS_BG[item.status] ?? '#eee' }]}>
                  <Text style={s.statusText}>{item.status}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.kind}>{item.kind}</Text>
                  <Text numberOfLines={1} style={s.req}>
                    {item.request}
                  </Text>
                </View>
              </TouchableOpacity>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  dispatchButton: {
    margin: 12,
    backgroundColor: C.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  dispatchText: { color: C.accentFg, fontWeight: '600', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.mutedBg,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '600', color: '#1a1c2c' },
  kind: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', color: C.muted, letterSpacing: 0.5 },
  req: { fontSize: 13, color: C.fg, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
