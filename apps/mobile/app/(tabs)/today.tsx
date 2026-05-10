import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

interface Entry {
  id: string;
  kind: 'clean_result' | 'blocker' | 'decision' | 'note';
  bodyMd: string;
  createdAt: string;
}

const BADGE: Record<Entry['kind'], { label: string; color: string }> = {
  clean_result: { label: 'result', color: '#a3e8b8' },
  blocker: { label: 'blocker', color: '#f3b6bf' },
  decision: { label: 'decision', color: '#b8c4ff' },
  note: { label: 'note', color: '#e2e3ea' },
};

export default function Today() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ entries: Entry[] }>('/api/daily-log');
    if (r.ok && r.data) setEntries(r.data.entries);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (loading && entries.length === 0) {
    return (
      <View style={s.empty}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={s.list}
      contentContainerStyle={{ padding: 12, gap: 10 }}
      data={entries.slice().reverse()}
      keyExtractor={(e) => e.id}
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
          <Text style={{ color: C.muted, fontSize: 14 }}>Nothing logged today.</Text>
        </View>
      }
      renderItem={({ item }) => {
        const badge = BADGE[item.kind];
        return (
          <View style={s.card}>
            <View style={s.row}>
              <View style={[s.badge, { backgroundColor: badge.color }]}>
                <Text style={s.badgeText}>{badge.label}</Text>
              </View>
              <Text style={s.timestamp}>
                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={s.body}>{item.bodyMd}</Text>
          </View>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: C.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', color: '#1a1c2c' },
  timestamp: { fontSize: 11, color: C.muted },
  body: { fontSize: 14, color: C.fg, lineHeight: 20 },
});
