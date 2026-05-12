import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, RefreshControl } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, apiBase } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  EmptyState,
  HStack,
  LoadingState,
  Pill,
  ScrollScreen,
  Text,
  VStack,
} from '@/ui';

type Kind = 'project' | 'experiment' | 'belief';

interface EntityRow {
  id: string;
  title?: string | null;
  status?: string | null;
  confidence?: string | null;
  kind?: string | null;
  slug?: string | null;
  body?: string | null;
  summaryMd?: string | null;
  hypothesis?: string | null;
  currentBelief?: string | null;
}

interface EntityResponse {
  entity: EntityRow;
}

const KIND_TITLES: Record<Kind, string> = {
  project: 'Project',
  experiment: 'Experiment',
  belief: 'Belief',
};

function webPathFor(kind: Kind, id: string, row: EntityRow | null): string {
  if (kind === 'project' && row?.slug) return `/projects/${row.slug}`;
  return `/e/${kind}/${id}`;
}

function bodyText(row: EntityRow): string {
  return row.body ?? row.summaryMd ?? row.hypothesis ?? row.currentBelief ?? '';
}

const VALID_KINDS = new Set<Kind>(['project', 'experiment', 'belief']);

export default function EntityDetailScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as Kind;
  const id = params.id;
  const validKind = VALID_KINDS.has(kind);

  const [row, setRow] = useState<EntityRow | null>(null);
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
    if (!validKind || !id) {
      setError('Unknown entity');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    // /api/entity/[kind]/[id] is access-aware (owner + entity members), unlike
    // /api/{projects,beliefs}/[id] which only export PATCH.
    const r = await api<EntityResponse>(`/api/entity/${kind}/${id}`, {
      signal: controller.signal,
    });
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (r.ok && r.data?.entity) {
      setRow(r.data.entity);
    } else if (r.error !== 'aborted') {
      setError(r.error ?? `Failed to load (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [validKind, kind, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (!validKind) {
    return (
      <ScrollScreen>
        <EmptyState icon="alert-circle-outline" title="Unknown" message={`No view for "${kind}".`} />
      </ScrollScreen>
    );
  }

  if (loading && !row) {
    return (
      <>
        <Stack.Screen options={{ title: KIND_TITLES[kind] }} />
        <LoadingState />
      </>
    );
  }

  const body = row ? bodyText(row) : '';

  return (
    <>
      <Stack.Screen options={{ title: KIND_TITLES[kind] }} />
      <ScrollScreen
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.accent}
          />
        }
      >
        {error ? (
          <Card variant="outlined" style={{ borderColor: t.colors.danger }}>
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          </Card>
        ) : null}

        {row ? (
          <>
            <VStack gap="md">
              <Text variant="title">{row.title ?? '(untitled)'}</Text>
              <HStack gap="sm" wrap>
                {row.status ? <Pill tone="neutral">{row.status}</Pill> : null}
                {row.confidence ? (
                  <Pill tone="accent">{row.confidence.toLowerCase()}</Pill>
                ) : null}
                {row.kind ? <Pill tone="info">{row.kind}</Pill> : null}
              </HStack>
            </VStack>

            {body ? (
              <Card pad="lg">
                <Text variant="body">{body}</Text>
              </Card>
            ) : (
              <Text variant="footnote" tone="subtle">
                No body.
              </Text>
            )}

            <Button
              label="Open on web"
              icon="open-outline"
              variant="secondary"
              fullWidth
              onPress={() => Linking.openURL(`${apiBase}${webPathFor(kind, id, row)}`)}
            />
          </>
        ) : null}
      </ScrollScreen>
    </>
  );
}
