import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
interface DailyLogResponse {
  day: string;
  entries: Entry[];
}
interface TodaySummary {
  counts: {
    activeExperiments: number;
    pendingApprovals: number;
    yesterdayCleanResults: number;
    todayCleanResults: number;
  };
  latestWeeklyDigest: null | {
    id: string;
    weekStart: string;
    sentAt: string | null;
    editedAt: string | null;
  };
}

const BADGE: Record<Entry['kind'], { label: string; color: string }> = {
  clean_result: { label: 'result', color: '#a3e8b8' },
  blocker: { label: 'blocker', color: '#f3b6bf' },
  decision: { label: 'decision', color: '#b8c4ff' },
  note: { label: 'note', color: '#e2e3ea' },
};
const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;

function isActionTrail(entry: Entry) {
  return ACTION_PREFIX_RE.test(entry.bodyMd);
}

function formatRefreshTime(date: Date | null) {
  if (!date) return 'not refreshed yet';
  return `last refreshed ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Today() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [cleanQuestion, setCleanQuestion] = useState<string | null>(null);
  const [cleanAnswer, setCleanAnswer] = useState('');
  const [cleanBusy, setCleanBusy] = useState<'question' | 'draft' | null>(null);

  const load = useCallback(async () => {
    const [r, summaryRes] = await Promise.all([
      api<DailyLogResponse>('/api/daily-log'),
      api<TodaySummary>('/api/today/summary'),
    ]);
    if (r.ok && r.data) {
      setEntries(r.data.entries);
      setDay(r.data.day);
      setLastRefreshedAt(new Date());
      setError(null);
    } else {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
    if (summaryRes.ok && summaryRes.data) setSummary(summaryRes.data);
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

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  async function askCleanQuestion() {
    setCleanBusy('question');
    setError(null);
    const r = await api<{ question?: string; error?: string }>('/api/daily-log/clean-result/question', {
      method: 'POST',
      body: JSON.stringify({ day }),
    });
    setCleanBusy(null);
    if (!r.ok || !r.data?.question) {
      setError(r.data?.error ?? r.error ?? 'Could not ask a clean-result question');
      return;
    }
    setCleanQuestion(r.data.question);
  }

  async function saveCleanResult() {
    if (!cleanQuestion) return;
    setCleanBusy('draft');
    setError(null);
    const r = await api<{ entry?: Entry; error?: string }>('/api/daily-log/clean-result/draft', {
      method: 'POST',
      body: JSON.stringify({ day, question: cleanQuestion, answer: cleanAnswer }),
    });
    setCleanBusy(null);
    if (!r.ok) {
      setError(r.data?.error ?? r.error ?? 'Could not save clean result');
      return;
    }
    setCleanAnswer('');
    setCleanQuestion(null);
    Alert.alert('Clean result saved');
    void load();
  }

  if (loading && entries.length === 0) {
    return (
      <View style={s.empty}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  const newest = entries.slice().reverse();
  const cleanResults = newest.filter((entry) => entry.kind === 'clean_result');
  const actionTrail = newest.filter(isActionTrail);
  const researchEntries = newest.filter((entry) => entry.kind !== 'clean_result' && !isActionTrail(entry));
  const sections = [
    {
      title: 'Clean results',
      subtitle: 'mentor-facing outcomes',
      data: cleanResults,
    },
    {
      title: 'Research entries',
      subtitle: 'notes, decisions, blockers',
      data: researchEntries,
    },
    {
      title: 'Action trail',
      subtitle: 'workflow actions and reasons',
      data: actionTrail,
    },
  ].filter((section) => section.data.length > 0);

  return (
    <SectionList
      style={s.list}
      contentContainerStyle={{ padding: 12, gap: 10 }}
      sections={sections}
      keyExtractor={(e) => e.id}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={C.accent}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <View style={s.header}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Today</Text>
              <Text style={s.meta}>{formatRefreshTime(lastRefreshedAt)}</Text>
            </View>
            <TouchableOpacity disabled={refreshing} onPress={refresh} style={s.secondaryButton}>
              <Text style={s.secondaryButtonText}>{refreshing ? 'Refreshing' : 'Refresh'}</Text>
            </TouchableOpacity>
          </View>

          <View style={s.cleanCard}>
            <View style={s.summaryGrid}>
              <SummaryPill label="Experiments" value={String(summary?.counts.activeExperiments ?? 0)} />
              <SummaryPill label="Approvals" value={String(summary?.counts.pendingApprovals ?? 0)} />
              <SummaryPill label="Yesterday" value={`${summary?.counts.yesterdayCleanResults ?? 0} results`} />
              <SummaryPill
                label="Weekly"
                value={
                  summary?.latestWeeklyDigest
                    ? summary.latestWeeklyDigest.sentAt
                      ? 'sent'
                      : summary.latestWeeklyDigest.editedAt
                        ? 'edited'
                        : 'draft'
                    : 'none'
                }
              />
            </View>
          </View>

          <View style={s.cleanCard}>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Clean result</Text>
                <Text style={s.meta}>{cleanResults.length} saved today</Text>
              </View>
              <TouchableOpacity disabled={cleanBusy !== null} onPress={askCleanQuestion} style={s.secondaryButton}>
                <Text style={s.secondaryButtonText}>
                  {cleanBusy === 'question' ? 'Asking' : cleanQuestion ? 'Ask again' : 'Ask'}
                </Text>
              </TouchableOpacity>
            </View>
            {cleanQuestion ? (
              <View style={{ gap: 8 }}>
                <Text style={s.question}>{cleanQuestion}</Text>
                <TextInput
                  value={cleanAnswer}
                  onChangeText={setCleanAnswer}
                  multiline
                  placeholder="Answer before saving..."
                  placeholderTextColor={C.muted}
                  style={s.input}
                />
                <TouchableOpacity disabled={cleanBusy !== null} onPress={saveCleanResult} style={s.primaryButton}>
                  <Text style={s.primaryButtonText}>{cleanBusy === 'draft' ? 'Saving' : 'Save clean result'}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {error ? <Text style={s.error}>{error}</Text> : null}
        </View>
      }
      ListEmptyComponent={
        <View style={s.empty}>
          <Text style={{ color: C.muted, fontSize: 14 }}>Nothing logged today.</Text>
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={s.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.meta}>{section.subtitle}</Text>
          </View>
          <Text style={s.count}>{section.data.length}</Text>
        </View>
      )}
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

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryPill}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { flex: 1, backgroundColor: C.bg },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 2,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.fg },
  meta: { fontSize: 12, color: C.muted },
  cleanCard: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryPill: {
    minWidth: '47%',
    backgroundColor: C.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  summaryLabel: { color: C.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  summaryValue: { color: C.fg, fontSize: 15, fontWeight: '700', marginTop: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.fg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 2,
    backgroundColor: C.bg,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.fg },
  count: { fontFamily: 'Courier', fontSize: 12, color: C.muted },
  card: {
    backgroundColor: C.mutedBg,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '600', color: '#1a1c2c' },
  timestamp: { fontSize: 11, color: C.muted },
  body: { fontSize: 14, color: C.fg, lineHeight: 20 },
  question: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 10,
    color: C.fg,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    padding: 10,
    color: C.fg,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryButtonText: { color: C.accentFg, fontWeight: '700' },
  secondaryButton: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  secondaryButtonText: { color: C.fg, fontSize: 12, fontWeight: '600' },
  error: { color: C.danger, fontSize: 13, lineHeight: 18 },
});
