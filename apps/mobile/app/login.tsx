import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { login, loginWithGoogle } from '@/lib/api';
import { registerForPush } from '@/lib/notifications';
import { radius, spacing, useTheme } from '@/lib/theme';
import { Button, HStack, Input, Screen, Separator, Text, VStack } from '@/ui';

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
  const t = useTheme();
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

  const canSubmit = !!(email.trim() && password) && !busy && !googleBusy;

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            paddingHorizontal: spacing.lg,
            gap: spacing.xl,
          }}
        >
          <VStack gap="md" style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.xl,
                backgroundColor: t.colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="planet" size={32} color={t.colors.accentFg} />
            </View>
            <VStack gap="xs" style={{ alignItems: 'center' }}>
              <Text variant="title">Sagan</Text>
              <Text variant="callout" tone="muted">
                Your research dashboard
              </Text>
            </VStack>
          </VStack>

          <VStack gap="md">
            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              placeholder="you@example.com"
            />
            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
              placeholder="••••••••"
              error={err}
            />

            <Button
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={onSubmit}
              loading={busy}
              disabled={!canSubmit}
              fullWidth
              size="lg"
            />
          </VStack>

          <HStack gap="md" style={{ marginVertical: spacing.xs }}>
            <Separator style={{ flex: 1 }} />
            <Text variant="caption" tone="subtle">
              OR
            </Text>
            <Separator style={{ flex: 1 }} />
          </HStack>

          <Button
            label={googleBusy ? 'Opening Google…' : 'Continue with Google'}
            onPress={onGoogle}
            loading={googleBusy}
            disabled={busy}
            variant="secondary"
            icon="logo-google"
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
