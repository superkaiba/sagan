import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, SectionList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { radius, spacing, useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  EmptyState,
  HStack,
  Input,
  LargeTitle,
  LoadingState,
  Pill,
  type PillTone,
  Screen,
  SectionLabel,
  Text,
  VStack,
} from '@/ui';

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

const ENTRY_TONE: Record<Entry['kind'], { tone: PillTone; label: string }> = {
  clean_result: { tone: 'success', label: 'result' },
  blocker: { tone: 'danger', label: 'blocker' },
  decision: { tone: 'info', label: 'decision' },
  note: { tone: 'neutral', label: 'note' },
};

const ACTION_PREFIX_RE = /^\s*(?:\*\*)?Action:/;
const isActionTrail = (entry: Entry) => ACTION_PREFIX_RE.test(entry.bodyMd);

function formatTime(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(date: Date | null) {
  if (!date) return 'Pull to refresh';
  const min = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (min < 1) return 'Updated just now';
  if (min < 60) return `Updated ${min}m ago`;
  return `Updated ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Today() {
  const t = useTheme();
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

  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const [r, summaryRes] = await Promise.all([
      api<DailyLogResponse>('/api/daily-log', { signal: controller.signal }),
      api<TodaySummary>('/api/today/summary', { signal: controller.signal }),
    ]);
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data) {
      setEntries(r.data.entries);
      setDay(r.data.day);
      setLastRefreshedAt(new Date());
      setError(null);
    } else if (r.error !== 'aborted') {
      setError(r.error ?? `Refresh failed (${r.status})`);
    }
    if (summaryRes.ok && summaryRes.data) setSummary(summaryRes.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  // useFocusEffect fires on every focus including initial mount — no separate
  // mount-time useEffect required.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  async function askCleanQuestion() {
    setCleanBusy('question');
    setError(null);
    const r = await api<{ question?: string; error?: string }>(
      '/api/daily-log/clean-result/question',
      { method: 'POST', body: JSON.stringify({ day }) },
    );
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
    const r = await api<{ entry?: Entry; error?: string }>(
      '/api/daily-log/clean-result/draft',
      { method: 'POST', body: JSON.stringify({ day, question: cleanQuestion, answer: cleanAnswer }) },
    );
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
      <Screen edges={['top']}>
        <LargeTitle title="Today" subtitle={formatRelative(lastRefreshedAt)} />
        <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.xs }}>
          <SummaryStrip summary={summary} />
        </View>
        <LoadingState />
      </Screen>
    );
  }

  const newest = entries.slice().reverse();
  const cleanResults = newest.filter((e) => e.kind === 'clean_result');
  const actionTrail = newest.filter(isActionTrail);
  const research = newest.filter((e) => e.kind !== 'clean_result' && !isActionTrail(e));

  const sections: Array<{ title: string; data: Entry[] }> = [
    { title: 'Clean results', data: cleanResults },
    { title: 'Research', data: research },
    { title: 'Action trail', data: actionTrail },
  ].filter((s) => s.data.length > 0);

  return (
    <Screen edges={['top']}>
      <LargeTitle title="Today" subtitle={formatRelative(lastRefreshedAt)} />
      <SectionList
        style={{ flex: 1, backgroundColor: t.colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingBottom: spacing['3xl'],
          gap: spacing.md,
        }}
        sections={sections}
        keyExtractor={(e) => e.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={t.colors.accent}
          />
        }
        ListHeaderComponent={
          <VStack gap="md" style={{ paddingBottom: spacing.xs }}>
            <SummaryStrip summary={summary} />

          <CleanResultCard
            count={cleanResults.length}
            question={cleanQuestion}
            answer={cleanAnswer}
            onAnswerChange={setCleanAnswer}
            busy={cleanBusy}
            onAsk={askCleanQuestion}
            onSave={saveCleanResult}
          />

            {error ? (
              <Card variant="outlined" style={{ borderColor: t.colors.danger }}>
                <Text variant="footnote" tone="danger">
                  {error}
                </Text>
              </Card>
            ) : null}
          </VStack>
        }
        ListEmptyComponent={
          <EmptyState
            icon="leaf-outline"
            title="Nothing logged today"
            message="Drop a note, blocker, decision, or clean result from the dashboard to see it here."
          />
        }
        renderSectionHeader={({ section }) => (
          <HStack
            gap="sm"
            justify="space-between"
            style={{
              paddingTop: spacing.md,
              paddingBottom: spacing.xs,
              backgroundColor: t.colors.bg,
            }}
          >
            <SectionLabel>{section.title}</SectionLabel>
            <Text variant="caption" tone="subtle">
              {section.data.length}
            </Text>
          </HStack>
        )}
        renderItem={({ item }) => {
          const tone = ENTRY_TONE[item.kind];
          return (
            <Card>
              <HStack justify="space-between">
                <Pill tone={tone.tone}>{tone.label}</Pill>
                <Text variant="caption" tone="subtle">
                  {formatTime(item.createdAt)}
                </Text>
              </HStack>
              <Text variant="body">{item.bodyMd}</Text>
            </Card>
          );
        }}
      />
    </Screen>
  );
}

function SummaryStrip({ summary }: { summary: TodaySummary | null }) {
  const items = [
    { label: 'Experiments', value: summary?.counts.activeExperiments ?? 0 },
    { label: 'Approvals', value: summary?.counts.pendingApprovals ?? 0 },
    { label: 'Yesterday', value: summary?.counts.yesterdayCleanResults ?? 0 },
    {
      label: 'Weekly',
      value:
        summary?.latestWeeklyDigest === null || summary?.latestWeeklyDigest === undefined
          ? '—'
          : summary.latestWeeklyDigest.sentAt
            ? '✓'
            : summary.latestWeeklyDigest.editedAt
              ? '·'
              : '○',
    },
  ];
  return (
    <HStack gap="sm">
      {items.map((it) => (
        <Card key={it.label} pad="md" gap="xs" style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text variant="micro" tone="muted">
            {it.label}
          </Text>
          <Text variant="title2">{String(it.value)}</Text>
        </Card>
      ))}
    </HStack>
  );
}

function CleanResultCard({
  count,
  question,
  answer,
  onAnswerChange,
  busy,
  onAsk,
  onSave,
}: {
  count: number;
  question: string | null;
  answer: string;
  onAnswerChange: (v: string) => void;
  busy: 'question' | 'draft' | null;
  onAsk: () => void;
  onSave: () => void;
}) {
  const t = useTheme();
  return (
    <Card pad="base" gap="md">
      <HStack justify="space-between" align="flex-start">
        <VStack gap="xs" style={{ flex: 1 }}>
          <Text variant="bodyEmph">Clean result</Text>
          <Text variant="footnote" tone="muted">
            {count} saved today · mentor-facing
          </Text>
        </VStack>
        <Button
          label={busy === 'question' ? 'Asking…' : question ? 'Ask again' : 'Ask'}
          onPress={onAsk}
          loading={busy === 'question'}
          disabled={busy !== null}
          variant="secondary"
          size="sm"
        />
      </HStack>
      {question ? (
        <VStack gap="sm">
          <View
            style={{
              backgroundColor: t.colors.sunken,
              padding: spacing.md,
              borderRadius: radius.md,
            }}
          >
            <Text variant="footnote">{question}</Text>
          </View>
          <Input
            value={answer}
            onChangeText={onAnswerChange}
            multiline
            placeholder="Write the answer before saving…"
          />
          <Button
            label={busy === 'draft' ? 'Saving…' : 'Save clean result'}
            onPress={onSave}
            loading={busy === 'draft'}
            disabled={busy !== null}
            fullWidth
          />
        </VStack>
      ) : null}
    </Card>
  );
}
