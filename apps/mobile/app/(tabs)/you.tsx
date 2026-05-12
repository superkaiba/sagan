import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import {
  api,
  apiBase,
  BUNDLE_VERSION,
  getLastOAuthLog,
  getToken,
  logout,
  probeSecureStore,
} from '@/lib/api';
import { unregisterCurrentToken } from '@/lib/notifications';
import { useTheme } from '@/lib/theme';
import {
  Button,
  Card,
  HStack,
  LargeTitle,
  Screen,
  ScrollScreen,
  SectionLabel,
  Separator,
  Text,
  VStack,
} from '@/ui';

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
  secureStore: string;
  oauthLog: string | null;
}

const EMPTY: DebugState = {
  tokenPresent: false,
  tokenLen: 0,
  tokenPreview: '',
  meStatus: null,
  meBody: null,
  summaryStatus: null,
  summaryBody: null,
  secureStore: '(not run)',
  oauthLog: null,
};

export default function You() {
  const t = useTheme();
  const [me, setMe] = useState<Me['user']>(null);
  const [debug, setDebug] = useState<DebugState>(EMPTY);
  const [running, setRunning] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const probe = useCallback(async () => {
    setRunning(true);
    const [token, secure] = await Promise.all([getToken(), probeSecureStore()]);
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
      secureStore: secure,
      oauthLog: getLastOAuthLog(),
    });
    if (meRes.ok && meRes.data) setMe(meRes.data.user);
    setRunning(false);
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  function confirmSignOut() {
    Alert.alert('Sign out?', 'Your session will be cleared on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await unregisterCurrentToken();
          await logout();
          router.replace('/login');
        },
      },
    ]);
  }

  return (
    <Screen edges={['top']}>
      <LargeTitle title="You" />
      <ScrollScreen
        pad={{ x: 16, y: 0 }}
        refreshControl={
          <RefreshControl refreshing={running} onRefresh={probe} tintColor={t.colors.accent} />
        }
      >
      <Card pad="lg" gap="md">
        <VStack gap="xs">
          <SectionLabel>Signed in as</SectionLabel>
          <Text variant="title3">{me?.email ?? '(not signed in)'}</Text>
        </VStack>
        {me?.role ? (
          <>
            <Separator />
            <HStack justify="space-between">
              <Text variant="footnote" tone="muted">
                Role
              </Text>
              <Text variant="footnote">{me.role}</Text>
            </HStack>
          </>
        ) : null}
        <Separator />
        <HStack justify="space-between">
          <Text variant="footnote" tone="muted">
            API
          </Text>
          <Text
            variant="footnote"
            tone="accent"
            onPress={() => Linking.openURL(apiBase)}
            numberOfLines={1}
            style={{ flexShrink: 1, marginLeft: 12 }}
          >
            {apiBase.replace(/^https?:\/\//, '')}
          </Text>
        </HStack>
      </Card>

      <VStack gap="sm">
        <Button
          label="Send test push"
          icon="notifications-outline"
          variant="secondary"
          fullWidth
          onPress={async () => {
            const r = await api('/api/push/test', { method: 'POST' });
            if (!r.ok) Alert.alert('Test push failed', `Status ${r.status}`);
          }}
        />
        <Button
          label="Open dashboard"
          icon="open-outline"
          variant="secondary"
          fullWidth
          onPress={() => Linking.openURL(apiBase)}
        />
        <Button
          label={showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
          icon={showDiagnostics ? 'eye-off-outline' : 'eye-outline'}
          variant="ghost"
          fullWidth
          onPress={() => setShowDiagnostics((v) => !v)}
        />
      </VStack>

      {showDiagnostics ? (
        <Card variant="sunken" pad="base" gap="sm">
          <HStack justify="space-between">
            <SectionLabel>Diagnostics</SectionLabel>
            <Button
              label={running ? 'Probing…' : 'Re-run'}
              size="sm"
              variant="ghost"
              loading={running}
              onPress={probe}
            />
          </HStack>
          <DiagRow label="Bundle" value={BUNDLE_VERSION} />
          <DiagRow label="SecureStore" value={debug.secureStore} />
          <DiagRow
            label="Token"
            value={debug.tokenPresent ? `${debug.tokenLen} chars · ${debug.tokenPreview}` : '(none)'}
          />
          <DiagRow label="auth/me" value={`http ${debug.meStatus ?? '…'}`} />
          {debug.meBody ? <Text variant="mono">{debug.meBody}</Text> : null}
          <DiagRow label="today/summary" value={`http ${debug.summaryStatus ?? '…'}`} />
          {debug.summaryBody ? <Text variant="mono">{debug.summaryBody}</Text> : null}
          {debug.oauthLog ? (
            <>
              <SectionLabel>Last OAuth</SectionLabel>
              <Text variant="mono">{debug.oauthLog}</Text>
            </>
          ) : null}
        </Card>
      ) : null}

        <Button
          label="Sign out"
          icon="log-out-outline"
          variant="destructive"
          fullWidth
          onPress={confirmSignOut}
        />
      </ScrollScreen>
    </Screen>
  );
}

function DiagRow({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" align="flex-start" gap="md">
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      <Text variant="footnote" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>
        {value}
      </Text>
    </HStack>
  );
}
