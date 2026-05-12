import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { EmptyState, LargeTitle, LoadingState, ListRow, Screen, ScrollScreen, Text, VStack } from '@/ui';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Counts {
  projects: number;
  experiments: number;
  beliefs: number;
}

interface Section {
  kind: 'projects' | 'experiments' | 'beliefs';
  title: string;
  subtitle: string;
  icon: IoniconName;
}

const SECTIONS: Section[] = [
  { kind: 'projects', title: 'Projects', subtitle: 'Research threads and narratives', icon: 'folder-outline' },
  { kind: 'experiments', title: 'Experiments', subtitle: 'Issues, runs, results', icon: 'flask-outline' },
  { kind: 'beliefs', title: 'Beliefs', subtitle: 'Hypotheses and their evidence', icon: 'bulb-outline' },
];

export default function BrowseScreen() {
  const t = useTheme();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [p, e, b] = await Promise.all([
      api<{ projects: unknown[] }>('/api/projects'),
      api<{ experiments: unknown[] }>('/api/experiments'),
      api<{ beliefs: unknown[] }>('/api/beliefs'),
    ]);
    if (p.ok && e.ok && b.ok) {
      setCounts({
        projects: p.data?.projects.length ?? 0,
        experiments: e.data?.experiments.length ?? 0,
        beliefs: b.data?.beliefs.length ?? 0,
      });
    } else {
      setError('Could not load counts. Pull to retry.');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  if (loading && !counts) {
    return (
      <Screen edges={['top']}>
        <LargeTitle title="Browse" />
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <LargeTitle title="Browse" />
      <ScrollScreen
        pad={{ x: 16, y: 0 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={t.colors.accent}
          />
        }
      >
        {error ? (
          <EmptyState icon="cloud-offline-outline" title="Couldn't load" message={error} />
        ) : (
          <VStack gap="sm">
            {SECTIONS.map((section) => {
              const count = counts?.[section.kind] ?? 0;
              return (
                <ListRow
                  key={section.kind}
                  title={section.title}
                  subtitle={section.subtitle}
                  leftIcon={section.icon}
                  onPress={() =>
                    router.push({ pathname: '/list/[kind]', params: { kind: section.kind } })
                  }
                  trailing={
                    <Text variant="footnote" tone="muted">
                      {count}
                    </Text>
                  }
                />
              );
            })}
          </VStack>
        )}
      </ScrollScreen>
    </Screen>
  );
}
