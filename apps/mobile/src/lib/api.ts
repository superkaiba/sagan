import * as SecureStore from 'expo-secure-store';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://dashboard.superkaiba.com';
const TOKEN_KEY = 'eps_session_token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, { keychainService: 'eps_research' });
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean },
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

export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  await clearToken();
}

export const apiBase = API_BASE;
