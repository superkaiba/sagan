/**
 * Push-notification setup. The dashboard server registers a device's Expo
 * push token by POSTing to /api/notifications/register on first boot;
 * notifications fire when `agent_runs.status` flips to awaiting_approval.
 *
 * The /api/notifications/register endpoint is not yet implemented on the
 * web side — see follow-up commit. This module captures the token and
 * caches it locally so the round-trip can be wired up without another
 * mobile build.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from './api';

const TOKEN_KEY = 'expo_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const next = await Notifications.requestPermissionsAsync();
    status = next.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  await SecureStore.setItemAsync(TOKEN_KEY, token.data);

  // Best-effort registration with the dashboard server. The endpoint may
  // not exist yet on older deployments; a 404 is non-fatal.
  try {
    await api('/api/notifications/register', {
      method: 'POST',
      json: { token: token.data, platform: Platform.OS },
    });
  } catch {
    // Ignore — older server, or network blip; we still keep the token locally.
  }

  return token.data;
}

export async function getCachedPushToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}
