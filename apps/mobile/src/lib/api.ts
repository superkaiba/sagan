import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://sagan.superkaiba.com';
const TOKEN_KEY = 'sagan_session_token';

let isHandling401 = false;

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainService: 'sagan' });
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean; noRecovery?: boolean },
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const token = init?.auth === false ? null : await getToken();
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : 'network_error' };
  }
  let data: T | null = null;
  if (res.headers.get('content-type')?.includes('application/json')) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
  }
  if ((res.status === 401 || res.status === 403) && init?.auth !== false && !init?.noRecovery) {
    // Stored session token is stale. Wipe it and bounce to login so the
    // user can re-auth (Google or password). Guarded so we only kick once.
    if (!isHandling401) {
      isHandling401 = true;
      await clearToken();
      try {
        router.replace('/login');
      } catch {
        // ignore: router may not be mounted yet
      }
      setTimeout(() => {
        isHandling401 = false;
      }, 2000);
    }
  }
  return { ok: res.ok, status: res.status, data };
}

export async function login(email: string, password: string): Promise<boolean> {
  const result = await api<{ ok: boolean; sessionToken?: string }>(`/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    headers: { 'x-client-mode': 'bearer' },
    auth: false,
  });
  if (!result.ok || !result.data?.sessionToken) return false;
  await setToken(result.data.sessionToken);
  return true;
}

export type GoogleLoginResult =
  | { kind: 'success' }
  | { kind: 'cancel' }
  | { kind: 'error'; error: string };

export async function loginWithGoogle(): Promise<GoogleLoginResult> {
  const returnUrl = Linking.createURL('auth/callback');
  const authUrl = `${API_BASE}/api/auth/google/start?mobile_redirect=${encodeURIComponent(returnUrl)}`;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
  } catch (err) {
    return { kind: 'error', error: err instanceof Error ? err.message : 'browser_failed' };
  }
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancel' };
  if (result.type !== 'success' || !result.url) return { kind: 'error', error: 'no_callback' };

  const parsed = Linking.parse(result.url);
  const params = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
  const errorParam = pickString(params.error);
  if (errorParam) return { kind: 'error', error: errorParam };
  const token = pickString(params.token);
  if (!token) return { kind: 'error', error: 'no_token' };
  await setToken(token);
  return { kind: 'success' };
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  await clearToken();
}

export const apiBase = API_BASE;
