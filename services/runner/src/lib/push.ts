/**
 * Expo push helper for the runner.
 *
 *   - pushToUser(userId, message): looks up registered push_devices and
 *     fans out via Expo's HTTP push API.
 *   - Receipts (delivery confirmations) are not yet wired; expired tokens
 *     are pruned on InvalidCredentials / DeviceNotRegistered errors.
 *
 * Reference: https://docs.expo.dev/push-notifications/sending-notifications/
 */
import { eq, inArray } from 'drizzle-orm';
import { pushDevices } from '@eps/db/schema';
import { db } from '../db.js';
import { log } from '../log.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  title: string;
  body: string;
  /** App-side route to deep-link into when the notification is tapped. */
  url?: string;
  /** Arbitrary payload for the mobile app to read. */
  data?: Record<string, unknown>;
  /** iOS/Android channel/category. Defaults to 'default'. */
  channelId?: string;
  /** Sound — set 'default' to vibrate / play; 'null' for silent. */
  sound?: 'default' | null;
  /** ttl, priority, etc. — mostly Expo defaults are fine. */
  priority?: 'default' | 'normal' | 'high';
}

export async function pushToUser(userId: string, message: PushMessage): Promise<void> {
  const tokens = await db()
    .select({ token: pushDevices.token })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId));
  if (tokens.length === 0) {
    log.debug('push: no devices for user', { userId });
    return;
  }
  await pushToTokens(
    tokens.map((t) => t.token),
    message,
  );
}

export async function pushToTokens(tokens: string[], message: PushMessage): Promise<void> {
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    sound: message.sound === undefined ? 'default' : message.sound,
    priority: message.priority ?? 'high',
    channelId: message.channelId ?? 'default',
    data: { ...(message.data ?? {}), url: message.url ?? null },
  }));

  let res: Response;
  try {
    res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    log.error('push: network error', { err: String(err) });
    return;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    log.error('push: bad status', { status: res.status, detail: detail.slice(0, 300) });
    return;
  }
  const json = (await res.json().catch(() => null)) as
    | { data?: Array<{ status: string; message?: string; details?: { error?: string } }> }
    | null;
  if (!json?.data) {
    log.warn('push: unexpected response shape');
    return;
  }
  // Prune tokens Expo flags as expired or unregistered.
  const stale: string[] = [];
  json.data.forEach((entry, i) => {
    if (entry.status === 'error') {
      const errCode = entry.details?.error ?? '';
      if (errCode === 'DeviceNotRegistered' || errCode === 'InvalidCredentials') {
        const token = tokens[i];
        if (token) stale.push(token);
      } else {
        log.warn('push: ticket error', { errCode, message: entry.message });
      }
    }
  });
  if (stale.length > 0) {
    await db().delete(pushDevices).where(inArray(pushDevices.token, stale));
    log.info('push: pruned stale tokens', { count: stale.length });
  }
  log.info('push: sent', { count: messages.length });
}
