import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { onReauthRequired } from '@/lib/api';
import { configureNotificationHandling, unregisterCurrentToken } from '@/lib/notifications';
import { useTheme, type as typography } from '@/lib/theme';

async function checkForUpdate(): Promise<void> {
  // Skip in dev / Expo Go — Updates is a no-op there.
  if (!Updates.isEnabled || __DEV__) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (!result.isAvailable) return;
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
  } catch {
    // Network or update-server failure — ignore; next launch will retry.
  }
}

export default function RootLayout() {
  useEffect(() => {
    const cleanup = configureNotificationHandling();
    return cleanup;
  }, []);

  useEffect(() => {
    return onReauthRequired(() => {
      // Best-effort push unregister; ignore failures so the redirect always runs.
      void unregisterCurrentToken().catch(() => {});
      router.replace('/login');
    });
  }, []);

  useEffect(() => {
    void checkForUpdate();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    return () => sub.remove();
  }, []);

  const { colors } = useTheme();

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { color: colors.fg, fontWeight: '600' },
          headerTintColor: colors.accent,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerLargeTitleStyle: { ...typography.largeTitle, color: colors.fg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="agent/new" options={{ title: 'New run', presentation: 'modal' }} />
        <Stack.Screen name="agent/[id]" options={{ title: 'Run' }} />
        <Stack.Screen name="list/[kind]" options={{ title: '' }} />
        <Stack.Screen name="entity/[kind]/[id]" options={{ title: '' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
