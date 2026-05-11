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
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'cancelled';
  request: string;
  createdAt: string;
  updatedAt?: string;
}

const STATUS_BG: Record<string, string> = {
  queued: '#dde1ee',
  running: '#fde9b5',
  awaiting_approval: '#ffd9a8',
  approved: '#c4f0d3',
  deploying: '#bdd4f5',
  blocked: '#f3b8a8',
  completed: '#bff0c9',
  failed: '#f5c0c8',
  cancelled: '#dadde4',
  rejected: '#ffc6c6',
};
const ACTIVE_STATUSES = new Set(['queued', 'running', 'approved', 'deploying']);

function formatRefreshTime(date: Date | null) {
  if (!date) return 'not refreshed yet';
  return `last refreshed ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function staleHint(run: AgentRun) {
  if (!ACTIVE_STATUSES.has(run.status)) return null;
  const basis = run.updatedAt ?? run.createdAt;
  const ageMs = Date.now() - new Date(basis).getTime();
  if (ageMs < 10 * 60 * 1000) return null;
  const minutes = Math.floor(ageMs / 60_000);
  return `no update for ${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`}`;
}

export default function AgentList() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ runs: AgentRun[] }>('/api/agent-runs?limit=50');
    if (r.ok && r.data) {
      setRuns(r.data.runs);
      setLastRefreshedAt(new Date());
      setError(null);
    } else {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  return (
    <View style={s.root}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Agent runs</Text>
          <Text style={s.meta}>{formatRefreshTime(lastRefreshedAt)}</Text>
        </View>
        <TouchableOpacity disabled={refreshing} onPress={refresh} style={s.secondaryButton}>
          <Text style={s.secondaryButtonText}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.actionsRow}>
        <Link href="/agent/new" asChild>
          <TouchableOpacity style={s.dispatchButton}>
            <Text style={s.dispatchText}>Dispatch</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {error ? <Text style={s.error}>{error}</Text> : null}

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
              onRefresh={refresh}
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
                  {staleHint(item) ? <Text style={s.stale}>{staleHint(item)}</Text> : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.fg },
  meta: { fontSize: 12, color: C.muted },
  actionsRow: { paddingHorizontal: 12, paddingTop: 10 },
  dispatchButton: {
    backgroundColor: C.accent,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  dispatchText: { color: C.accentFg, fontWeight: '600', fontSize: 15 },
  secondaryButton: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.mutedBg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButtonText: { color: C.fg, fontSize: 12, fontWeight: '600' },
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
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '600', color: '#1a1c2c' },
  kind: { fontSize: 10, fontWeight: '700', color: C.muted },
  req: { fontSize: 13, color: C.fg, marginTop: 2 },
  stale: { fontSize: 11, color: C.danger, marginTop: 3 },
  error: { marginHorizontal: 12, marginTop: 8, color: C.danger, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
});
