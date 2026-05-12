import { useCallback, useState } from 'react';
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

interface EntityResponse {
  project?: any;
  experiment?: any;
  belief?: any;
}

const KIND_CONFIG: Record<
  Kind,
  {
    endpoint: (id: string) => string;
    field: keyof EntityResponse;
    title: string;
    webPath: (id: string, row: any) => string;
  }
> = {
  project: {
    endpoint: (id) => `/api/projects/${id}`,
    field: 'project',
    title: 'Project',
    webPath: (id, row) => (row?.slug ? `/projects/${row.slug}` : `/e/project/${id}`),
  },
  experiment: {
    endpoint: (id) => `/api/experiments/${id}`,
    field: 'experiment',
    title: 'Experiment',
    webPath: (id) => `/e/experiment/${id}`,
  },
  belief: {
    endpoint: (id) => `/api/beliefs/${id}`,
    field: 'belief',
    title: 'Belief',
    webPath: (id) => `/e/belief/${id}`,
  },
};

function bodyText(row: any): string {
  return row?.body ?? row?.summaryMd ?? row?.hypothesis ?? row?.currentBelief ?? '';
}

export default function EntityDetailScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const kind = params.kind as Kind;
  const id = params.id;
  const config = KIND_CONFIG[kind];

  const [row, setRow] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!config || !id) {
      setError('Unknown entity');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setError(null);
    const r = await api<EntityResponse>(config.endpoint(id));
    if (r.ok && r.data) {
      setRow((r.data as any)[config.field] ?? r.data);
    } else {
      setError(r.error ?? `Failed to load (${r.status})`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [config, id]);

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
      <ScrollScreen>
        <EmptyState icon="alert-circle-outline" title="Unknown" message={`No view for "${kind}".`} />
      </ScrollScreen>
    );
  }

  if (loading && !row) {
    return (
      <>
        <Stack.Screen options={{ title: config.title }} />
        <LoadingState />
      </>
    );
  }

  const body = row ? bodyText(row) : '';

  return (
    <>
      <Stack.Screen options={{ title: config.title }} />
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
                  <Pill tone="accent">{String(row.confidence).toLowerCase()}</Pill>
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
              onPress={() => Linking.openURL(`${apiBase}${config.webPath(id, row)}`)}
            />
          </>
        ) : null}
      </ScrollScreen>
    </>
  );
}
