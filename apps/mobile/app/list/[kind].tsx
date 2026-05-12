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
import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

type Kind = 'projects' | 'experiments' | 'beliefs';

interface BaseRow {
  id: string;
  title: string;
  updatedAt?: string;
  createdAt?: string;
  status?: string;
  summaryMd?: string | null;
  hypothesis?: string | null;
  currentBelief?: string | null;
  confidence?: string | null;
  body?: string | null;
}

const KIND_CONFIG: Record<Kind, { endpoint: string; field: string; title: string; entityKind: string }> = {
  projects: { endpoint: '/api/projects', field: 'projects', title: 'Projects', entityKind: 'project' },
  experiments: { endpoint: '/api/experiments', field: 'experiments', title: 'Experiments', entityKind: 'experiment' },
  beliefs: { endpoint: '/api/beliefs', field: 'beliefs', title: 'Beliefs', entityKind: 'belief' },
};

const STATUS_COLOR: Record<string, string> = {
  proposed: '#dde1ee',
  running: '#fde9b5',
  awaiting_approval: '#ffd9a8',
  done: '#bff0c9',
  blocked: '#f3b8a8',
  failed: '#f5c0c8',
  draft: '#e2e3ea',
  active: '#c4f0d3',
  supported: '#bff0c9',
  weakened: '#fde9b5',
  falsified: '#f3b8a8',
  retracted: '#dadde4',
};

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function preview(row: BaseRow): string {
  const text = row.summaryMd ?? row.hypothesis ?? row.currentBelief ?? row.body ?? '';
  return text.replace(/\s+/g, ' ').slice(0, 140).trim();
}

export default function ListScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const config = KIND_CONFIG[kind as Kind];

  const [rows, setRows] = useState<BaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config) {
      setError(`Unknown kind: ${kind}`);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    const r = await api<Record<string, BaseRow[]>>(config.endpoint);
    if (r.ok && r.data) {
      setRows(r.data[config.field] ?? []);
    } else {
      setError(r.error ?? `Failed to load (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [config, kind]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (!config) {
    return (
      <View style={s.center}>
        <Text style={s.error}>Unknown list: {kind}</Text>
      </View>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ title: config.title }} />
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: config.title }} />
      <FlatList
        style={s.root}
        contentContainerStyle={s.content}
        data={rows}
        keyExtractor={(row) => row.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyText}>{error ?? `No ${config.title.toLowerCase()} yet.`}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusColor = item.status ? STATUS_COLOR[item.status] ?? C.mutedBg : null;
          const body = preview(item);
          return (
            <Link
              href={{ pathname: '/entity/[kind]/[id]', params: { kind: config.entityKind, id: item.id } }}
              asChild
            >
              <TouchableOpacity style={s.card}>
                <Text style={s.title} numberOfLines={2}>
                  {item.title}
                </Text>
                {body ? (
                  <Text style={s.body} numberOfLines={2}>
                    {body}
                  </Text>
                ) : null}
                <View style={s.meta}>
                  {item.status ? (
                    <View style={[s.statusPill, { backgroundColor: statusColor ?? C.mutedBg }]}>
                      <Text style={s.statusText}>{item.status}</Text>
                    </View>
                  ) : null}
                  {item.confidence ? (
                    <View style={[s.statusPill, { backgroundColor: C.mutedBg }]}>
                      <Text style={s.statusText}>{item.confidence.toLowerCase()}</Text>
                    </View>
                  ) : null}
                  <Text style={s.time}>{formatRelativeTime(item.updatedAt ?? item.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            </Link>
          );
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  empty: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },
  error: { color: C.danger, fontSize: 13 },
  card: {
    backgroundColor: C.mutedBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  title: { color: C.fg, fontSize: 16, fontWeight: '600' },
  body: { color: C.muted, fontSize: 13, lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, color: C.fg, textTransform: 'uppercase', letterSpacing: 0.4 },
  time: { color: C.muted, fontSize: 11, marginLeft: 'auto' },
});
