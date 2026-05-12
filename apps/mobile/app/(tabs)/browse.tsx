import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';
import { EmptyState, LargeTitle, LoadingState, ListRow, Screen, ScrollScreen, Text, VStack } from '@/ui';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Counts {
  projects: number;
  experiments: number | null;
  beliefs: number;
}

type SectionKind = 'projects' | 'experiments' | 'beliefs';

interface Section {
  kind: SectionKind;
  title: string;
  subtitle: string;
  icon: IoniconName;
  ownerOnly: boolean;
}

const SECTIONS: Section[] = [
  { kind: 'projects', title: 'Projects', subtitle: 'Research threads and narratives', icon: 'folder-outline', ownerOnly: false },
  { kind: 'experiments', title: 'Experiments', subtitle: 'Issues, runs, results', icon: 'flask-outline', ownerOnly: true },
  { kind: 'beliefs', title: 'Beliefs', subtitle: 'Hypotheses and their evidence', icon: 'bulb-outline', ownerOnly: false },
];

interface MeResponse {
  user: { role?: string } | null;
}

export default function BrowseScreen() {
  const t = useTheme();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [role, setRole] = useState<string | null>(null);
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
    setError(null);
    const meRes = await api<MeResponse>('/api/auth/me', { signal: controller.signal });
    if (controller.signal.aborted || !isMountedRef.current) return;
    const userRole = meRes.data?.user?.role ?? null;
    const isOwner = userRole === 'owner';

    const [p, e, b] = await Promise.all([
      api<{ projects: unknown[] }>('/api/projects', { signal: controller.signal }),
      isOwner
        ? api<{ experiments: unknown[] }>('/api/experiments', { signal: controller.signal })
        : Promise.resolve({ ok: true, status: 200, data: { experiments: [] } } as const),
      api<{ beliefs: unknown[] }>('/api/beliefs', { signal: controller.signal }),
    ]);
    if (controller.signal.aborted || !isMountedRef.current) return;
    if (p.ok && e.ok && b.ok) {
      setCounts({
        projects: p.data?.projects.length ?? 0,
        experiments: isOwner ? e.data?.experiments.length ?? 0 : null,
        beliefs: b.data?.beliefs.length ?? 0,
      });
      setRole(userRole);
    } else if (p.error !== 'aborted') {
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

  const isOwner = role === 'owner';
  const visibleSections = SECTIONS.filter((s) => !s.ownerOnly || isOwner);

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
            {visibleSections.map((section) => {
              const rawCount = counts?.[section.kind];
              const count = typeof rawCount === 'number' ? rawCount : 0;
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
