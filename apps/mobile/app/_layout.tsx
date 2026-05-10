import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { registerForPushNotificationsAsync } from '../src/notifications';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync().catch(() => {
      // Permission may have been denied — non-fatal.
    });
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0b0b0e' },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="run/[id]" options={{ headerShown: true, title: 'Agent run' }} />
      </Stack>
    </>
  );
}
