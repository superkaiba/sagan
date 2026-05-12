import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, apiBase } from '@/lib/api';
import { C } from '@/lib/theme';

type Kind = 'project' | 'experiment' | 'belief';

interface EntityResponse {
  project?: any;
  experiment?: any;
  belief?: any;
}

const KIND_CONFIG: Record<Kind, { endpoint: (id: string) => string; field: keyof EntityResponse; title: string; webPath: (id: string, row: any) => string }> = {
  project: {
    endpoint: (id) => `/api/projects/${id}`,
    field: 'project',
    title: 'Project',
    webPath: (id, row) => (row?.slug ? `/projects/${row.slug}` : `/e/project/${id}`),
  },
  experiment: {
    endpoint: (id) => `/api/experiments/${id}`,
    field: 'experiment',
    title: 'Experiment',
    webPath: (id) => `/e/experiment/${id}`,
  },
  belief: {
    endpoint: (id) => `/api/beliefs/${id}`,
    field: 'belief',
    title: 'Belief',
    webPath: (id) => `/e/belief/${id}`,
  },
};

function bodyText(row: any): string {
  return row?.body ?? row?.summaryMd ?? row?.hypothesis ?? row?.currentBelief ?? '';
}

export default function EntityDetailScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as Kind;
  const id = params.id;
  const config = KIND_CONFIG[kind];

  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config || !id) {
      setError('Unknown entity');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    const r = await api<EntityResponse>(config.endpoint(id));
    if (r.ok && r.data) {
      setRow((r.data as any)[config.field] ?? r.data);
    } else {
      setError(r.error ?? `Failed to load (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [config, id]);

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
        <Text style={s.error}>Unknown entity kind: {kind}</Text>
      </View>
    );
  }

  if (loading && !row) {
    return (
      <View style={s.center}>
        <Stack.Screen options={{ title: config.title }} />
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const body = row ? bodyText(row) : '';

  return (
    <>
      <Stack.Screen options={{ title: config.title }} />
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
      >
        {error ? <Text style={s.error}>{error}</Text> : null}
        {row ? (
          <>
            <Text style={s.title}>{row.title ?? '(untitled)'}</Text>
            <View style={s.metaRow}>
              {row.status ? (
                <View style={s.pill}>
                  <Text style={s.pillText}>{row.status}</Text>
                </View>
              ) : null}
              {row.confidence ? (
                <View style={s.pill}>
                  <Text style={s.pillText}>{String(row.confidence).toLowerCase()}</Text>
                </View>
              ) : null}
              {row.kind ? (
                <View style={s.pill}>
                  <Text style={s.pillText}>{row.kind}</Text>
                </View>
              ) : null}
            </View>
            {body ? <Text style={s.body}>{body}</Text> : <Text style={s.muted}>No body.</Text>}
            <TouchableOpacity
              style={s.openButton}
              onPress={() => Linking.openURL(`${apiBase}${config.webPath(id, row)}`)}
            >
              <Text style={s.openButtonText}>Open on web</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  error: { color: C.danger, fontSize: 13 },
  title: { color: C.fg, fontSize: 22, fontWeight: '700', lineHeight: 28 },
  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: C.mutedBg, borderWidth: 1, borderColor: C.border },
  pillText: { fontSize: 12, color: C.fg, textTransform: 'uppercase', letterSpacing: 0.4 },
  body: { color: C.fg, fontSize: 15, lineHeight: 22 },
  muted: { color: C.muted, fontStyle: 'italic' },
  openButton: {
    marginTop: 12,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  openButtonText: { color: C.accentFg, fontWeight: '600', fontSize: 15 },
});
