import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  SectionLabel,
  Text,
  VStack,
} from '@/ui';

type ApprovalKind = 'experiment' | 'clean_result' | 'agent_run';

interface ApprovalAction {
  kind: ApprovalKind;
  id: string;
  status: string;
}

interface ApprovalItem {
  key: string;
  group: 'decision' | 'blocked' | 'review';
  urgencyRank: number;
  title: string;
  context: string;
  requestedAction: string;
  kind: string;
  status: string;
  entityKind: string;
  entityId: string;
  href: string;
  createdAt: string;
  updatedAt: string;
  action?: ApprovalAction;
}

const GROUP_TITLE: Record<ApprovalItem['group'], string> = {
  decision: 'Needs decision',
  blocked: 'Blocked',
  review: 'Result review',
};

const GROUP_TONE: Record<ApprovalItem['group'], PillTone> = {
  decision: 'warning',
  blocked: 'danger',
  review: 'info',
};

const STATUS_TONE: Record<string, PillTone> = {
  awaiting_approval: 'warning',
  reviewing: 'info',
  blocked: 'danger',
  followups_running: 'info',
  promote_ready: 'success',
  needs_owner: 'warning',
};

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMin = Math.floor((Date.now() - t) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(t).toLocaleDateString('en-US');
}

export default function ApprovalsScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; verb: string } | null>(null);

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
    const r = await api<{ items: ApprovalItem[] }>('/api/approvals', {
      signal: controller.signal,
    });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data) {
      setItems(r.data.items);
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

  async function act(item: ApprovalItem, verb: 'approve' | 'defer' | 'block' | 'reject' | 'reopen') {
    const action = item.action;
    if (!action) return;
    setBusy({ id: item.key, verb });
    let req: { url: string; method: string; body?: string };
    if (action.kind === 'experiment') {
      const targetStatus = verb === 'approve' ? 'approved' : verb === 'defer' ? 'planning' : 'blocked';
      req = {
        url: `/api/experiments/${action.id}`,
        method: 'PATCH',
        body: JSON.stringify({
          status: targetStatus,
          note:
            verb === 'approve'
              ? 'Owner approved from mobile.'
              : verb === 'defer'
                ? 'Owner deferred from mobile.'
                : 'Owner blocked from mobile.',
        }),
      };
    } else if (action.kind === 'clean_result') {
      const targetStatus = verb === 'approve' ? 'approved' : verb === 'reopen' ? 'reviewing' : 'blocked';
      req = {
        url: `/api/clean-results/${action.id}`,
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      };
    } else {
      req = {
        url: `/api/agent-runs/${action.id}/${verb === 'reject' ? 'reject' : 'approve'}`,
        method: 'POST',
      };
    }
    const r = await api(req.url, { method: req.method, body: req.body });
    setBusy(null);
    if (!r.ok) {
      setError(r.error ?? `${verb} failed (${r.status})`);
      return;
    }
    void load();
  }

  const grouped = useMemo(() => {
    if (!items) return [];
    return (['decision', 'blocked', 'review'] as const)
      .map((g) => ({ group: g, items: items.filter((i) => i.group === g) }))
      .filter((s) => s.items.length > 0);
  }, [items]);

  if (loading && !items) {
    return (
      <Screen edges={['top']}>
        <LargeTitle title="Approvals" />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <LargeTitle
        title="Approvals"
        subtitle={items && items.length > 0 ? `${items.length} waiting` : 'All caught up'}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: theme.colors.bg }}
        contentContainerStyle={{
          paddingHorizontal: spacing.base,
          paddingBottom: spacing['3xl'],
          gap: spacing.md,
        }}
        data={grouped}
        keyExtractor={(g) => g.group}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
          />
        }
        ListEmptyComponent={
          error ? (
            <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} />
          ) : (
            <EmptyState
              icon="checkmark-circle-outline"
              title="Nothing waiting"
              message="Approvals, blockers, and clean-result reviews will land here when they need attention."
            />
          )
        }
        renderItem={({ item: section }) => (
          <VStack gap="sm">
            <HStack justify="space-between">
              <SectionLabel>{GROUP_TITLE[section.group]}</SectionLabel>
              <Text variant="caption" tone="subtle">
                {section.items.length}
              </Text>
            </HStack>
            {section.items.map((item) => {
              const isBusy = busy?.id === item.key;
              return (
                <Card key={item.key} pad="base" gap="sm">
                  <HStack gap="sm" wrap>
                    <Pill tone={GROUP_TONE[section.group]}>{item.kind.replace('_', ' ')}</Pill>
                    {item.status ? (
                      <Pill tone={STATUS_TONE[item.status] ?? 'neutral'}>
                        {item.status.replace(/_/g, ' ')}
                      </Pill>
                    ) : null}
                    <Text variant="caption" tone="subtle" style={{ marginLeft: 'auto' }}>
                      {formatRelative(item.updatedAt)}
                    </Text>
                  </HStack>
                  <Text
                    variant="bodyEmph"
                    onPress={() =>
                      router.push({
                        pathname: '/entity/[kind]/[id]',
                        params: { kind: item.entityKind, id: item.entityId },
                      })
                    }
                  >
                    {item.title}
                  </Text>
                  {item.context ? (
                    <Text variant="footnote" tone="muted" numberOfLines={3}>
                      {item.context}
                    </Text>
                  ) : null}
                  <HStack gap="xs">
                    <Ionicons name="alert-circle-outline" size={12} color={theme.colors.mutedFg} />
                    <Text variant="caption" tone="muted">
                      {item.requestedAction}
                    </Text>
                  </HStack>
                  {item.action ? renderActionRow(item, act, isBusy, busy?.verb ?? null) : null}
                </Card>
              );
            })}
          </VStack>
        )}
      />
    </Screen>
  );
}

function renderActionRow(
  item: ApprovalItem,
  act: (item: ApprovalItem, verb: 'approve' | 'defer' | 'block' | 'reject' | 'reopen') => void,
  isBusy: boolean,
  verb: string | null,
) {
  const action = item.action!;
  if (action.kind === 'experiment') {
    return (
      <HStack gap="sm" wrap>
        <Button
          label="Approve"
          size="sm"
          loading={isBusy && verb === 'approve'}
          disabled={isBusy}
          onPress={() => act(item, 'approve')}
        />
        <Button
          label="Defer"
          size="sm"
          variant="secondary"
          loading={isBusy && verb === 'defer'}
          disabled={isBusy}
          onPress={() => act(item, 'defer')}
        />
        <Button
          label="Block"
          size="sm"
          variant="destructive"
          loading={isBusy && verb === 'block'}
          disabled={isBusy}
          onPress={() => act(item, 'block')}
        />
      </HStack>
    );
  }
  if (action.kind === 'clean_result') {
    if (action.status === 'blocked') {
      return (
        <HStack gap="sm" wrap>
          <Button
            label="Reopen"
            size="sm"
            variant="secondary"
            loading={isBusy && verb === 'reopen'}
            disabled={isBusy}
            onPress={() => act(item, 'reopen')}
          />
        </HStack>
      );
    }
    return (
      <HStack gap="sm" wrap>
        <Button
          label="Approve"
          size="sm"
          loading={isBusy && verb === 'approve'}
          disabled={isBusy}
          onPress={() => act(item, 'approve')}
        />
        <Button
          label="Block"
          size="sm"
          variant="destructive"
          loading={isBusy && verb === 'block'}
          disabled={isBusy}
          onPress={() => act(item, 'block')}
        />
      </HStack>
    );
  }
  // agent_run
  return (
    <HStack gap="sm" wrap>
      <Button
        label="Approve"
        size="sm"
        loading={isBusy && verb === 'approve'}
        disabled={isBusy}
        onPress={() => act(item, 'approve')}
      />
      <Button
        label="Reject"
        size="sm"
        variant="destructive"
        loading={isBusy && verb === 'reject'}
        disabled={isBusy}
        onPress={() => act(item, 'reject')}
      />
    </HStack>
  );
}
