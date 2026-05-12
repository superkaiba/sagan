import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureNotificationHandling } from '@/lib/notifications';

export default function RootLayout() {
  useEffect(() => {
    const cleanup = configureNotificationHandling();
    return cleanup;
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#fbfbfd' },
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="agent/new" options={{ title: 'Dispatch' }} />
        <Stack.Screen name="agent/[id]" options={{ title: 'Run' }} />
        <Stack.Screen name="list/[kind]" options={{ title: 'Browse' }} />
        <Stack.Screen name="entity/[kind]/[id]" options={{ title: 'Detail' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
