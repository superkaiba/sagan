/**
 * Expo Push delivery — used to wake the phone when an agent_run flips
 * to awaiting_approval. Single-user dashboard, so we fan out to every
 * device row in push_devices.
 *
 * Failures are logged and swallowed; missing a push must never block
 * the runner pipeline.
 */
import { db, schema } from './db.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function sendApprovalPush(runId: string, planLen: number): Promise<void> {
  const devices = await db().select().from(schema.pushDevices);
  if (devices.length === 0) return;

  const payload: PushPayload = {
    title: 'Plan ready for approval',
    body: `Run ${runId.slice(0, 8)} — ${planLen} chars`,
    data: { kind: 'awaiting_approval', runId, route: `/run/${runId}` },
  };

  const messages = devices.map((d) => ({
    to: d.token,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    data: payload.data,
  }));

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, deflate',
        'content-type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      console.warn(`[push] expo push api ${response.status}: ${await response.text()}`);
    }
  } catch (err) {
    console.warn('[push] failed to send approval push:', err);
  }
}
