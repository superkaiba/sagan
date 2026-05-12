import { useCallback, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import {
  Card,
  EmptyState,
  HStack,
  LoadingState,
  Pill,
  type PillTone,
  PlainScreen,
  Text,
  VStack,
} from '@/ui';

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

const STATUS_TONE: Record<string, PillTone> = {
  proposed: 'neutral',
  running: 'warning',
  awaiting_approval: 'warning',
  done: 'success',
  blocked: 'danger',
  failed: 'danger',
  draft: 'neutral',
  active: 'success',
  supported: 'success',
  weakened: 'warning',
  falsified: 'danger',
  retracted: 'neutral',
  completed: 'success',
};

function relTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function preview(row: BaseRow): string {
  const text = row.summaryMd ?? row.hypothesis ?? row.currentBelief ?? row.body ?? '';
  return text.replace(/\s+/g, ' ').slice(0, 160).trim();
}

export default function ListScreen() {
  const t = useTheme();
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
      <PlainScreen>
        <Stack.Screen options={{ title: 'Unknown' }} />
        <EmptyState icon="alert-circle-outline" title="Unknown list" message={`No view for "${kind}".`} />
      </PlainScreen>
    );
  }

  if (loading && rows.length === 0) {
    return (
      <PlainScreen>
        <Stack.Screen options={{ title: config.title }} />
        <LoadingState />
      </PlainScreen>
    );
  }

  return (
    <PlainScreen>
      <Stack.Screen options={{ title: config.title, headerLargeTitle: true }} />
      <FlatList
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingTop: spacing.sm,
          paddingBottom: spacing['3xl'],
          gap: spacing.sm,
        }}
        data={rows}
        keyExtractor={(row) => row.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title={error ? "Couldn't load" : `No ${config.title.toLowerCase()} yet`}
            message={error ?? 'Create one from the dashboard and it will show up here.'}
          />
        }
        renderItem={({ item }) => {
          const body = preview(item);
          return (
            <Card
              onPress={() =>
                router.push({
                  pathname: '/entity/[kind]/[id]',
                  params: { kind: config.entityKind, id: item.id },
                })
              }
              pad="base"
              gap="sm"
            >
              <Text variant="bodyEmph" numberOfLines={2}>
                {item.title || '(untitled)'}
              </Text>
              {body ? (
                <Text variant="footnote" tone="muted" numberOfLines={2}>
                  {body}
                </Text>
              ) : null}
              <HStack gap="sm" wrap style={{ marginTop: 2 }}>
                {item.status ? (
                  <Pill tone={STATUS_TONE[item.status] ?? 'neutral'}>{item.status}</Pill>
                ) : null}
                {item.confidence ? (
                  <Pill tone="neutral">{item.confidence.toLowerCase()}</Pill>
                ) : null}
                <VStack style={{ marginLeft: 'auto' }}>
                  <Text variant="caption" tone="subtle">
                    {relTime(item.updatedAt ?? item.createdAt)}
                  </Text>
                </VStack>
              </HStack>
            </Card>
          );
        }}
      />
    </PlainScreen>
  );
}
