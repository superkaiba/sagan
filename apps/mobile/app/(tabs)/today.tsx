import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import type { DailyLogEntry, DailyLogKind } from '../../src/types';

const KIND_LABEL: Record<DailyLogKind, string> = {
  clean_result: 'CLEAN RESULT',
  blocker: 'BLOCKER',
  decision: 'DECISION',
  note: 'NOTE',
};

const KIND_COLOR: Record<DailyLogKind, string> = {
  clean_result: '#22c55e',
  blocker: '#f87171',
  decision: '#a78bfa',
  note: '#9ca3af',
};

export default function TodayScreen() {
  const [entries, setEntries] = useState<DailyLogEntry[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api<{ day: string; entries: DailyLogEntry[] }>('/api/daily-log');
      setEntries(data.entries);
      setDay(data.day);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('signed out — open Profile to sign in again');
      } else {
        setError('failed to load today');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        {day ? <Text style={styles.day}>{day}</Text> : null}
      </View>

      {entries === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={entries ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No entries yet today. Tap Agent to dispatch a run.</Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor="#fff"
            />
          }
          renderItem={({ item }) => <Entry entry={item} />}
        />
      )}
    </SafeAreaView>
  );
}

function Entry({ entry }: { entry: DailyLogEntry }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.kind, { color: KIND_COLOR[entry.kind] }]}>
        {KIND_LABEL[entry.kind]}
      </Text>
      <Text style={styles.body} numberOfLines={6}>
        {entry.bodyMd}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0e' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title: { color: '#fff', fontSize: 32, fontWeight: '700' },
  day: { color: '#9ca3af', fontSize: 14, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#f87171' },
  list: { padding: 16, gap: 12 },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 32 },
  card: {
    backgroundColor: '#15151a',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  kind: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  body: { color: '#e5e7eb', fontSize: 15, lineHeight: 21 },
});
