/**
 * Mobile push setup. Three things happen here:
 *
 *   1. registerForPush() — asks for permissions, fetches an Expo push
 *      token, and POSTs it to /api/push/register so the runner can fan
 *      out notifications to this device.
 *   2. configureNotificationHandling() — sets the foreground display
 *      behavior + a tap-handler that deep-links to the route stored on
 *      the notification's data payload.
 *   3. unregisterCurrentToken() — called on sign-out to remove the
 *      device row.
 *
 * Wired in app/_layout.tsx (configureNotificationHandling) and in the
 * login screen (registerForPush after a successful sign-in).
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { api } from './api';

let cachedToken: string | null = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function configureNotificationHandling() {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { url?: string } | undefined;
    if (data?.url && typeof data.url === 'string') {
      try {
        router.push(data.url as never);
      } catch {
        // bad url — swallow
      }
    }
  });
  return () => sub.remove();
}

export async function registerForPush(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('[push] simulator/emulator: skipping');
    return null;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#5b6cff',
    });
  }
  const settings = await Notifications.getPermissionsAsync();
  let granted =
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  if (!granted) {
    const ask = await Notifications.requestPermissionsAsync();
    granted =
      ask.granted ||
      ask.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ||
      ask.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED;
  }
  if (!granted) {
    console.warn('[push] permission denied');
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: projectId as string } : undefined,
    );
    token = result.data;
  } catch (err) {
    console.warn('[push] failed to get token', err);
    return null;
  }

  cachedToken = token;
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  await api('/api/push/register', {
    method: 'POST',
    body: JSON.stringify({ token, platform }),
  });
  return token;
}

export async function unregisterCurrentToken() {
  if (!cachedToken) return;
  await api('/api/push/unregister', {
    method: 'POST',
    body: JSON.stringify({ token: cachedToken }),
  }).catch(() => {});
  cachedToken = null;
}
