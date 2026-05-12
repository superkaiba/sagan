import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { api, apiBase, getToken, logout } from '@/lib/api';
import { unregisterCurrentToken } from '@/lib/notifications';
import { C } from '@/lib/theme';

interface Me {
  user: { id: string; email: string; displayName: string | null; role?: string } | null;
}

interface DebugState {
  tokenPresent: boolean;
  tokenLen: number;
  tokenPreview: string;
  meStatus: number | null;
  meBody: string | null;
  summaryStatus: number | null;
  summaryBody: string | null;
}

const EMPTY: DebugState = {
  tokenPresent: false,
  tokenLen: 0,
  tokenPreview: '',
  meStatus: null,
  meBody: null,
  summaryStatus: null,
  summaryBody: null,
};

export default function You() {
  const [me, setMe] = useState<Me['user']>(null);
  const [debug, setDebug] = useState<DebugState>(EMPTY);
  const [running, setRunning] = useState(false);

  const probe = useCallback(async () => {
    setRunning(true);
    const token = await getToken();
    const meRes = await api<Me>('/api/auth/me', { noRecovery: true });
    const summaryRes = await api<unknown>('/api/today/summary', { noRecovery: true });
    setDebug({
      tokenPresent: !!token,
      tokenLen: token?.length ?? 0,
      tokenPreview: token ? `${token.slice(0, 6)}…${token.slice(-4)}` : '',
      meStatus: meRes.status,
      meBody: JSON.stringify(meRes.data ?? null).slice(0, 200),
      summaryStatus: summaryRes.status,
      summaryBody: JSON.stringify(summaryRes.data ?? null).slice(0, 200),
    });
    if (meRes.ok && meRes.data) setMe(meRes.data.user);
    setRunning(false);
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  return (
    <ScrollView style={s.root} contentContainerStyle={{ padding: 12, gap: 12 }}>
      <View style={s.card}>
        <Text style={s.label}>Signed in as</Text>
        <Text style={s.value}>{me?.email ?? '(not signed in)'}</Text>
        {me?.role ? (
          <>
            <Text style={[s.label, { marginTop: 8 }]}>Role</Text>
            <Text style={s.value}>{me.role}</Text>
          </>
        ) : null}
        <Text style={[s.label, { marginTop: 8 }]}>API base</Text>
        <Text style={s.value}>{apiBase}</Text>
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={[s.label, { flex: 1 }]}>Diagnostics</Text>
          <TouchableOpacity disabled={running} onPress={probe} style={s.smallButton}>
            <Text style={s.smallButtonText}>{running ? 'Probing…' : 'Re-run'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.label}>Token in SecureStore</Text>
        <Text style={s.value}>
          {debug.tokenPresent ? `${debug.tokenLen} chars · ${debug.tokenPreview}` : '(none)'}
        </Text>
        <Text style={[s.label, { marginTop: 8 }]}>/api/auth/me</Text>
        <Text style={s.value}>http {debug.meStatus ?? '…'}</Text>
        {debug.meBody ? <Text style={s.mono}>{debug.meBody}</Text> : null}
        <Text style={[s.label, { marginTop: 8 }]}>/api/today/summary</Text>
        <Text style={s.value}>http {debug.summaryStatus ?? '…'}</Text>
        {debug.summaryBody ? <Text style={s.mono}>{debug.summaryBody}</Text> : null}
      </View>

      <View style={s.card}>
        <TouchableOpacity
          onPress={() => Linking.openURL(apiBase)}
          style={[s.button, { backgroundColor: C.mutedBg }]}
        >
          <Text style={[s.buttonText, { color: C.fg }]}>Open in browser</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            const r = await api('/api/push/test', { method: 'POST' });
            if (!r.ok) console.warn('[push test] failed', r.status);
          }}
          style={[s.button, { backgroundColor: C.mutedBg }]}
        >
          <Text style={[s.buttonText, { color: C.fg }]}>Send test push</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={async () => {
            await unregisterCurrentToken();
            await logout();
            router.replace('/login');
          }}
          style={s.button}
        >
          <Text style={s.buttonText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  card: {
    backgroundColor: C.mutedBg,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  label: { fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  value: { fontSize: 14, color: C.fg },
  mono: { fontFamily: 'monospace', fontSize: 11, color: C.muted, marginTop: 2 },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: C.accent,
  },
  buttonText: { color: C.accentFg, fontWeight: '600' },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  smallButtonText: { color: C.fg, fontSize: 12, fontWeight: '500' },
});
