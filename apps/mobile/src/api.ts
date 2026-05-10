/**
 * Tiny fetch wrapper that talks to the dashboard API and threads the
 * `eps_session` cookie through manually. React Native's fetch doesn't
 * persist cookies the way a browser does, so we capture Set-Cookie on
 * login and attach the value on every subsequent request.
 */
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'eps_session';

function defaultBase(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase;
  return (
    process.env.EXPO_PUBLIC_API_BASE ?? fromExtra ?? 'https://eps-research-dashboard.vercel.app'
  );
}

export const apiBase = defaultBase();

export async function getSession(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SESSION_KEY);
  } catch {
    return null;
  }
}

export async function setSession(value: string | null): Promise<void> {
  if (!value) {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    return;
  }
  await SecureStore.setItemAsync(SESSION_KEY, value);
}

function parseSetCookie(header: string | null): string | null {
  if (!header) return null;
  const match = header.split(/,(?=[^;]+=)/).find((part) => part.trim().startsWith(`${SESSION_KEY}=`));
  if (!match) return null;
  const kv = match.split(';')[0]?.trim();
  if (!kv) return null;
  const value = kv.split('=').slice(1).join('=');
  return value || null;
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `request failed with ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown };

export async function api<T = unknown>(path: string, init: ApiInit = {}): Promise<T> {
  const session = await getSession();
  const headers = new Headers(init.headers ?? {});
  if (session) headers.set('cookie', `${SESSION_KEY}=${session}`);
  if (init.json !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : (init as RequestInit).body,
  });

  // Login path returns a fresh cookie; capture it.
  if (path === '/api/auth/login' && response.ok) {
    const cookie = parseSetCookie(response.headers.get('set-cookie'));
    if (cookie) await setSession(cookie);
  }

  let payload: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export async function logout(): Promise<void> {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // Even if the server logout fails, we drop the local cookie.
  }
  await setSession(null);
}
