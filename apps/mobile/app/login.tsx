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
import { login, loginWithGoogle } from '@/lib/api';
import { registerForPush } from '@/lib/notifications';
import { C } from '@/lib/theme';

const GOOGLE_ERROR_LABELS: Record<string, string> = {
  google_not_configured: 'Google sign-in is not configured on the server.',
  google_state_invalid: 'Sign-in session expired. Try again.',
  google_token_failed: "Couldn't reach Google. Try again.",
  google_profile_failed: "Couldn't read your Google profile.",
  google_email_unverified: 'Your Google email is not verified.',
  google_no_account: 'No account is linked to that email.',
  no_callback: 'Sign-in window closed unexpectedly.',
  no_token: 'Sign-in did not return a session.',
};

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

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

  async function onGoogle() {
    setGoogleBusy(true);
    setErr(null);
    const result = await loginWithGoogle();
    if (result.kind === 'success') {
      void registerForPush().catch(() => {});
      router.replace('/(tabs)/today');
    } else if (result.kind === 'error') {
      setErr(GOOGLE_ERROR_LABELS[result.error] ?? `Sign-in failed (${result.error}).`);
    }
    setGoogleBusy(false);
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
          disabled={busy || googleBusy || !email.trim() || !password}
          onPress={onSubmit}
          style={[s.button, (busy || googleBusy || !email.trim() || !password) && s.buttonDisabled]}
        >
          {busy ? <ActivityIndicator color={C.accentFg} /> : <Text style={s.buttonText}>Sign in</Text>}
        </TouchableOpacity>

        <View style={s.divider}>
          <View style={s.dividerLine} />
          <Text style={s.dividerText}>or</Text>
          <View style={s.dividerLine} />
        </View>

        <TouchableOpacity
          disabled={busy || googleBusy}
          onPress={onGoogle}
          style={[s.googleButton, (busy || googleBusy) && s.buttonDisabled]}
        >
          {googleBusy ? (
            <ActivityIndicator color={C.fg} />
          ) : (
            <Text style={s.googleButtonText}>Continue with Google</Text>
          )}
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
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    gap: 8,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: C.border },
  dividerText: { color: C.muted, fontSize: 12 },
  googleButton: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  googleButtonText: { color: C.fg, fontWeight: '600', fontSize: 15 },
});
