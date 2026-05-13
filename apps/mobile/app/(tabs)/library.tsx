import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { spacing, useTheme } from '@/lib/theme';
import {
  Card,
  EmptyState,
  HStack,
  LargeTitle,
  LoadingState,
  Pill,
  type PillTone,
  Screen,
  SectionLabel,
  Text,
  VStack,
} from '@/ui';

type Topic =
  | 'current_project'
  | 'general_safety'
  | 'general_ai'
  | 'cognitive_science'
  | 'neuroscience'
  | 'other';

type ReadState = 'unread' | 'summary_read' | 'saved_for_later' | 'reading' | 'read' | 'read_deeply';

interface LitItem {
  id: string;
  title: string;
  authors: unknown;
  type: string;
  url: string | null;
  arxivId: string | null;
  doi: string | null;
  releasedOn: string | null;
  abstract: string | null;
  summaryMd: string | null;
  relevanceReasonMd: string | null;
  threatReasonMd: string | null;
  topic: Topic | null;
  readState: ReadState;
  updatedAt: string;
}

const TOPIC_ORDER: Array<{ key: Topic; title: string; subtitle: string }> = [
  {
    key: 'current_project',
    title: 'Related to current project',
    subtitle: 'Directly tied to active beliefs and experiments.',
  },
  { key: 'general_safety', title: 'General AI safety', subtitle: 'Alignment, interpretability, eval.' },
  { key: 'general_ai', title: 'General AI', subtitle: 'ML and NLP research.' },
  { key: 'cognitive_science', title: 'Cognitive science', subtitle: 'Psychology, decisions, mind.' },
  { key: 'neuroscience', title: 'Neuroscience', subtitle: 'Brain and neural systems.' },
  { key: 'other', title: 'Other', subtitle: 'Everything else.' },
];

const READ_STATE_TONE: Record<ReadState, PillTone> = {
  unread: 'info',
  summary_read: 'info',
  saved_for_later: 'info',
  reading: 'warning',
  read: 'success',
  read_deeply: 'success',
};

const READ_STATE_LABEL: Record<ReadState, string> = {
  unread: 'unread',
  summary_read: 'summary read',
  saved_for_later: 'saved',
  reading: 'reading',
  read: 'read',
  read_deeply: 'read deeply',
};

// "needs attention" excludes saved_for_later (explicitly deferred) and the
// two terminal states (read, read_deeply). summary_read still counts because
// the full paper is yet to be read.
const ACTIVE_READ_STATES: ReadState[] = ['unread', 'summary_read', 'reading'];

function authorsLine(value: unknown): string {
  if (!value) return 'Unknown authors';
  if (Array.isArray(value)) {
    const names = value
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object' && 'name' in a) return String((a as { name?: unknown }).name ?? '');
        return '';
      })
      .filter(Boolean);
    if (names.length === 0) return 'Unknown authors';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 3).join(', ')} +${names.length - 3}`;
  }
  if (typeof value === 'string') return value;
  return 'Unknown authors';
}

function recencyLabel(value: string | null): string {
  if (!value) return '';
  const released = new Date(`${value}T00:00:00Z`).getTime();
  if (!Number.isFinite(released)) return value;
  const days = Math.floor((Date.now() - released) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

export default function LibraryScreen() {
  const t = useTheme();
  const [items, setItems] = useState<LitItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const r = await api<{ litItems: LitItem[] }>('/api/lit-items', { signal: controller.signal });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data) {
      setItems(r.data.litItems);
      setError(null);
    } else if (r.error !== 'aborted') {
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

  const sections = useMemo(() => {
    if (!items) return [];
    const sorted = [...items].sort((a, b) => {
      const aDate = a.releasedOn ?? a.updatedAt.slice(0, 10);
      const bDate = b.releasedOn ?? b.updatedAt.slice(0, 10);
      return bDate.localeCompare(aDate);
    });
    return TOPIC_ORDER.map((topic) => ({
      title: topic.title,
      subtitle: topic.subtitle,
      key: topic.key,
      data: sorted.filter((it) => (it.topic ?? 'other') === topic.key).slice(0, 50),
    })).filter((s) => s.data.length > 0);
  }, [items]);

  if (loading && !items) {
    return (
      <Screen edges={['top']}>
        <LargeTitle title="Library" />
        <LoadingState />
      </Screen>
    );
  }

  const total = items?.length ?? 0;
  const active = items?.filter((it) => ACTIVE_READ_STATES.includes(it.readState)).length ?? 0;

  return (
    <Screen edges={['top']}>
      <LargeTitle
        title="Library"
        subtitle={total === 0 ? 'No papers yet' : `${total} papers · ${active} need attention`}
      />
      <SectionList
        style={{ flex: 1, backgroundColor: t.colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingBottom: spacing['3xl'],
          gap: spacing.md,
        }}
        sections={sections}
        keyExtractor={(it) => it.id}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={t.colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="book-outline"
            title={error ? "Couldn't load" : 'No papers yet'}
            message={
              error ??
              'Add a paper, blog post, or report from the web dashboard to see it queued here.'
            }
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
            <VStack gap="xs" style={{ flex: 1 }}>
              <SectionLabel>{section.title}</SectionLabel>
              <Text variant="caption" tone="subtle">
                {section.subtitle}
              </Text>
            </VStack>
            <Text variant="caption" tone="subtle">
              {section.data.length}
            </Text>
          </HStack>
        )}
        renderItem={({ item }) => (
          <Card
            onPress={() =>
              router.push({
                pathname: '/entity/[kind]/[id]',
                params: { kind: 'lit_item', id: item.id },
              })
            }
            pad="base"
            gap="sm"
          >
            <Text variant="bodyEmph" numberOfLines={2}>
              {item.title || '(untitled)'}
            </Text>
            <Text variant="footnote" tone="muted" numberOfLines={1}>
              {authorsLine(item.authors)}
            </Text>
            {item.summaryMd ? (
              <Text variant="footnote" numberOfLines={3} tone="fg">
                {item.summaryMd}
              </Text>
            ) : null}
            <HStack gap="sm" wrap>
              <Pill tone={READ_STATE_TONE[item.readState] ?? 'neutral'}>
                {READ_STATE_LABEL[item.readState] ?? item.readState}
              </Pill>
              {item.releasedOn ? (
                <Text variant="caption" tone="subtle">
                  {recencyLabel(item.releasedOn)}
                </Text>
              ) : null}
              {item.arxivId ? (
                <Text variant="caption" tone="subtle">
                  arxiv {item.arxivId}
                </Text>
              ) : null}
            </HStack>
          </Card>
        )}
      />
    </Screen>
  );
}
