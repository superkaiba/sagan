import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { login } from '@/lib/api';
import { registerForPush } from '@/lib/notifications';
import { C } from '@/lib/theme';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password) return;
    setBusy(true);
    setErr(null);
    const ok = await login(email.trim(), password);
    if (ok) {
      // Best-effort push registration (no-op on simulator / denied perms).
      void registerForPush().catch(() => {});
      router.replace('/(tabs)/today');
    } else {
      setErr('Wrong email or password.');
    }
    setBusy(false);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={s.root}
    >
      <View style={s.card}>
        <Text style={s.title}>Sign in</Text>
        <Text style={s.subtitle}>Sagan</Text>

        <Text style={s.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          style={s.input}
          placeholder="you@example.com"
          placeholderTextColor={C.muted}
        />

        <Text style={s.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          style={s.input}
          placeholder="••••••••"
          placeholderTextColor={C.muted}
        />

        {err ? <Text style={s.err}>{err}</Text> : null}

        <TouchableOpacity
          disabled={busy || !email.trim() || !password}
          onPress={onSubmit}
          style={[s.button, (busy || !email.trim() || !password) && s.buttonDisabled]}
        >
          {busy ? <ActivityIndicator color={C.accentFg} /> : <Text style={s.buttonText}>Sign in</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: C.mutedBg,
    borderRadius: 12,
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.fg },
  subtitle: { fontSize: 13, color: C.muted, marginBottom: 8 },
  label: { fontSize: 12, color: C.fg, fontWeight: '500', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.fg,
    fontSize: 16,
  },
  err: { color: C.danger, marginTop: 4, fontSize: 13 },
  button: {
    marginTop: 12,
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: C.accentFg, fontWeight: '600', fontSize: 15 },
});
