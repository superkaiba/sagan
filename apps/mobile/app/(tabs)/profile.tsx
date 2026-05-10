import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, apiBase, logout } from '../../src/api';
import { getCachedPushToken } from '../../src/notifications';
import type { Me } from '../../src/types';

export default function ProfileScreen() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<Me>('/api/auth/me');
        if (!cancelled) setMe(data);
      } catch (err) {
        if (!cancelled && err instanceof ApiError && err.status === 401) {
          router.replace('/login');
        }
      }
      const token = await getCachedPushToken();
      if (!cancelled) setPushToken(token);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <View style={styles.body}>
        <Row label="Email" value={me?.user.email ?? '—'} />
        <Row label="API base" value={apiBase} />
        <Row
          label="Push token"
          value={pushToken ? `${pushToken.slice(0, 24)}…` : 'not registered'}
        />
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0b0e' },
  header: { paddingHorizontal: 20, paddingTop: 12 },
  title: { color: '#fff', fontSize: 28, fontWeight: '700' },
  body: { padding: 16, gap: 12 },
  row: {
    backgroundColor: '#15151a',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rowLabel: { color: '#9ca3af', fontSize: 12, letterSpacing: 1, fontWeight: '700' },
  rowValue: { color: '#e5e7eb', fontSize: 15 },
  button: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
