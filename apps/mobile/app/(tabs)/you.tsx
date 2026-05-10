import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { api, apiBase, logout } from '@/lib/api';
import { C } from '@/lib/theme';

interface Me {
  user: { id: string; email: string; displayName: string | null } | null;
}

export default function You() {
  const [me, setMe] = useState<Me['user']>(null);

  useEffect(() => {
    void (async () => {
      const r = await api<Me>('/api/auth/me');
      if (r.ok && r.data) setMe(r.data.user);
    })();
  }, []);

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{me?.email ?? '…'}</Text>
        <Text style={[s.label, { marginTop: 12 }]}>API base</Text>
        <Text style={s.value}>{apiBase}</Text>

        <TouchableOpacity
          onPress={() => Linking.openURL(apiBase)}
          style={[s.button, { backgroundColor: C.mutedBg }]}
        >
          <Text style={[s.buttonText, { color: C.fg }]}>Open in browser</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await logout();
            router.replace('/login');
          }}
          style={s.button}
        >
          <Text style={s.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, padding: 12 },
  card: {
    backgroundColor: C.mutedBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  label: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 14, color: C.fg },
  button: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: C.accent,
  },
  buttonText: { color: C.accentFg, fontWeight: '600' },
});
