import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useColorScheme } from 'react-native';
import { configureNotificationHandling } from '@/lib/notifications';
import { palette, type } from '@/lib/theme';

export default function RootLayout() {
  useEffect(() => {
    const cleanup = configureNotificationHandling();
    return cleanup;
  }, []);

  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? palette.dark : palette.light;

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
          headerLargeTitleStyle: { ...type.largeTitle, color: colors.fg },
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
