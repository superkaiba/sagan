import { useCallback, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  EmptyState,
  HStack,
  LargeTitle,
  LoadingState,
  Pill,
  type PillTone,
  Screen,
  Text,
  VStack,
} from '@/ui';

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

const STATUS_TONE: Record<AgentRun['status'], PillTone> = {
  queued: 'neutral',
  running: 'warning',
  awaiting_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  deploying: 'info',
  blocked: 'danger',
  completed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

const ACTIVE_STATUSES = new Set(['queued', 'running', 'approved', 'deploying']);

function staleHint(run: AgentRun) {
  if (!ACTIVE_STATUSES.has(run.status)) return null;
  const basis = run.updatedAt ?? run.createdAt;
  const ageMs = Date.now() - new Date(basis).getTime();
  if (ageMs < 10 * 60 * 1000) return null;
  const minutes = Math.floor(ageMs / 60_000);
  return `idle ${minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString();
}

export default function AgentList() {
  const t = useTheme();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ runs: AgentRun[] }>('/api/agent-runs?limit=50');
    if (r.ok && r.data) {
      setRuns(r.data.runs);
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
    <Screen edges={['top']}>
      <LargeTitle title="Runs" />
      <FlatList
        style={{ flex: 1, backgroundColor: t.colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.sm,
          paddingBottom: spacing['3xl'],
          gap: spacing.sm,
        }}
        data={runs}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.colors.accent} />
        }
        ListHeaderComponent={
          <VStack gap="md" style={{ marginBottom: spacing.xs }}>
            <Button
              label="New run"
              icon="add"
              onPress={() => router.push('/agent/new')}
              fullWidth
              size="lg"
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
          loading ? (
            <LoadingState />
          ) : (
            <EmptyState
              icon="flash-outline"
              title="No runs yet"
              message="Dispatch a plan, apply, QA, or experiment run to see it here."
              action={<Button label="Start a run" onPress={() => router.push('/agent/new')} />}
            />
          )
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/agent/${item.id}`)} pad="md" gap="sm">
            <HStack justify="space-between">
              <Pill tone={STATUS_TONE[item.status]}>{item.status.replace('_', ' ')}</Pill>
              <Text variant="caption" tone="subtle">
                {formatTime(item.updatedAt ?? item.createdAt)}
              </Text>
            </HStack>
            <Text variant="bodyEmph" numberOfLines={2}>
              {item.request}
            </Text>
            <HStack gap="sm">
              <Text variant="caption" tone="muted">
                {item.kind.toUpperCase()}
              </Text>
              {staleHint(item) ? (
                <Text variant="caption" tone="danger">
                  · {staleHint(item)}
                </Text>
              ) : null}
            </HStack>
          </Card>
        )}
      />
    </Screen>
  );
}
