import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/lib/api';
import { C } from '@/lib/theme';

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
  { kind: 'projects', title: 'Projects', subtitle: 'Research threads & narratives', icon: 'folder-outline' },
  { kind: 'experiments', title: 'Experiments', subtitle: 'Issues, runs, results', icon: 'flask-outline' },
  { kind: 'beliefs', title: 'Beliefs', subtitle: 'Hypotheses & their evidence', icon: 'bulb-outline' },
];

export default function BrowseScreen() {
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
      <View style={s.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
    >
      {error ? <Text style={s.error}>{error}</Text> : null}
      {SECTIONS.map((section) => {
        const count = counts?.[section.kind] ?? 0;
        return (
          <Link
            key={section.kind}
            href={{ pathname: '/list/[kind]', params: { kind: section.kind } }}
            asChild
          >
            <TouchableOpacity style={s.card}>
              <View style={s.iconWrap}>
                <Ionicons name={section.icon} size={22} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{section.title}</Text>
                <Text style={s.subtitle}>{section.subtitle}</Text>
              </View>
              <View style={s.countWrap}>
                <Text style={s.count}>{count}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.muted} />
            </TouchableOpacity>
          </Link>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, gap: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  error: { color: C.danger, fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: C.mutedBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: C.fg, fontSize: 16, fontWeight: '600' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 2 },
  countWrap: {
    minWidth: 32,
    paddingHorizontal: 8,
    height: 24,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: C.fg, fontSize: 13, fontWeight: '600' },
});
