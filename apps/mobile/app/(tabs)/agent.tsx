import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError } from '../../src/api';
import type { AgentRun, AgentRunKind } from '../../src/types';
import { startTranscription, type TranscribeHandle } from '../../src/voice';

const KINDS: AgentRunKind[] = ['plan', 'apply', 'qa', 'experiment'];

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

export default function AgentScreen() {
  const router = useRouter();
  const [request, setRequest] = useState('');
  const [kind, setKind] = useState<AgentRunKind>('plan');
  const [submitting, setSubmitting] = useState(false);
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [recording, setRecording] = useState(false);
  const handleRef = useRef<TranscribeHandle | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ runs: AgentRun[] }>('/api/agent-runs?limit=30');
      setRuns(data.runs);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        Alert.alert('Signed out', 'Open Profile to sign in again.');
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

  async function dispatch() {
    if (!request.trim()) return;
    setSubmitting(true);
    try {
      const res = await api<{ runId: string }>('/api/agent-runs', {
        method: 'POST',
        json: {
          kind,
          request: request.trim(),
          approvalRequired: kind === 'apply' || kind === 'experiment',
        },
      });
      setRequest('');
      router.push(`/run/${res.runId}`);
      void load();
    } catch (err) {
      const msg = err instanceof ApiError ? `error ${err.status}` : 'network error';
      Alert.alert('Dispatch failed', msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleVoice() {
    if (recording) {
      handleRef.current?.stop();
      handleRef.current = null;
      setRecording(false);
      return;
    }
    setRecording(true);
    try {
      handleRef.current = await startTranscription((event) => {
        if (event.type === 'partial' || event.type === 'final') {
          setRequest(event.transcript);
        }
        if (event.type === 'final' || event.type === 'error') {
          setRecording(false);
          handleRef.current?.stop();
          handleRef.current = null;
          if (event.type === 'error') Alert.alert('Voice', event.message);
        }
      });
    } catch (err) {
      setRecording(false);
      Alert.alert('Voice', err instanceof Error ? err.message : 'unknown error');
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Agent</Text>
        </View>

        <View style={styles.dispatcher}>
          <View style={styles.kindRow}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                style={[styles.kindChip, kind === k && styles.kindChipActive]}
              >
                <Text style={[styles.kindChipText, kind === k && styles.kindChipTextActive]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={request}
            onChangeText={setRequest}
            placeholder="What should the runner do?"
            placeholderTextColor="#6b7280"
            multiline
            style={styles.input}
          />

          <View style={styles.actions}>
            <Pressable
              onPress={toggleVoice}
              style={[styles.voice, recording && styles.voiceActive]}
            >
              <Text style={styles.voiceText}>{recording ? '● Stop' : '🎤 Voice'}</Text>
            </Pressable>
            <Pressable
              onPress={dispatch}
              disabled={submitting || !request.trim()}
              style={({ pressed }) => [
                styles.dispatch,
                (submitting || !request.trim()) && styles.dispatchDisabled,
                pressed && styles.dispatchPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#0b0b0e" />
              ) : (
                <Text style={styles.dispatchText}>Dispatch</Text>
              )}
            </Pressable>
          </View>
        </View>

        <FlatList
          data={runs ?? []}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.sectionTitle}>Recent runs</Text>}
          ListEmptyComponent={<Text style={styles.empty}>No runs yet.</Text>}
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
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/run/${item.id}`)}
              style={({ pressed }) => [styles.runCard, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.runHeader}>
                <Text style={styles.runKind}>{item.kind}</Text>
                <Text
                  style={[
                    styles.runStatus,
                    { color: STATUS_COLOR[item.status] ?? '#9ca3af' },
                  ]}
                >
                  {item.status}
                </Text>
              </View>
              <Text style={styles.runRequest} numberOfLines={2}>
                {item.request}
              </Text>
            </Pressable>
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0e' },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  dispatcher: { padding: 16, gap: 10 },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1c1c22',
  },
  kindChipActive: { backgroundColor: '#fafafa' },
  kindChipText: { color: '#9ca3af', fontWeight: '600', fontSize: 13 },
  kindChipTextActive: { color: '#0b0b0e' },
  input: {
    color: '#fff',
    backgroundColor: '#15151a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 8 },
  voice: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1c1c22',
    alignItems: 'center',
  },
  voiceActive: { backgroundColor: '#7f1d1d' },
  voiceText: { color: '#e5e7eb', fontWeight: '600' },
  dispatch: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fafafa',
    alignItems: 'center',
  },
  dispatchDisabled: { opacity: 0.5 },
  dispatchPressed: { opacity: 0.8 },
  dispatchText: { color: '#0b0b0e', fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  sectionTitle: {
    color: '#9ca3af',
    fontSize: 12,
    letterSpacing: 1,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 4,
  },
  empty: { color: '#6b7280', textAlign: 'center', marginTop: 24 },
  runCard: {
    backgroundColor: '#15151a',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  runHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  runKind: { color: '#fff', fontWeight: '600', textTransform: 'uppercase', fontSize: 12 },
  runStatus: { fontWeight: '600', fontSize: 12 },
  runRequest: { color: '#d1d5db', fontSize: 14 },
});
