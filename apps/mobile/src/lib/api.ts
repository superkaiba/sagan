import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Updates from 'expo-updates';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://sagan.superkaiba.com';
const TOKEN_KEY = 'sagan_session_token';
const SECURE_OPTS = { keychainService: 'sagan' } as const;
const REQUEST_TIMEOUT_MS = 20_000;

// Read both keychain services so tokens written under the old (unnamespaced)
// key are still picked up; new writes always go to the 'sagan' namespace.
export async function getToken(): Promise<string | null> {
  const v = await SecureStore.getItemAsync(TOKEN_KEY, SECURE_OPTS);
  if (v) return v;
  return SecureStore.getItemAsync(TOKEN_KEY);
}
export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, SECURE_OPTS);
}
export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY, SECURE_OPTS);
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
}

// Captured by loginWithGoogle for diagnostics on the You tab.
let lastOAuthLog: string | null = null;
export function getLastOAuthLog(): string | null {
  return lastOAuthLog;
}
function setOAuthLog(message: string): void {
  lastOAuthLog = `[${new Date().toISOString().slice(11, 19)}] ${message}`;
}

export async function probeSecureStore(): Promise<string> {
  const k = '__sagan_probe__';
  const v = `probe-${Date.now()}`;
  try {
    await SecureStore.setItemAsync(k, v, SECURE_OPTS);
    const read = await SecureStore.getItemAsync(k, SECURE_OPTS);
    await SecureStore.deleteItemAsync(k, SECURE_OPTS).catch(() => {});
    return read === v ? `ok (${read.length} chars)` : `MISMATCH wrote=${v} read=${read}`;
  } catch (err) {
    return `THREW ${err instanceof Error ? err.message : String(err)}`;
  }
}

export const BUNDLE_VERSION = (() => {
  const channel = Updates.channel ?? 'dev';
  const runtime = Updates.runtimeVersion ?? '?';
  const updateId = Updates.updateId?.slice(0, 8) ?? 'embedded';
  return `${channel}@${runtime}+${updateId}`;
})();

// Subscribers (root layout) listen for 401s so they can drop back to /login
// without each screen re-implementing the same redirect.
type ReauthListener = () => void;
const reauthListeners = new Set<ReauthListener>();
export function onReauthRequired(listener: ReauthListener): () => void {
  reauthListeners.add(listener);
  return () => reauthListeners.delete(listener);
}
function emitReauth(): void {
  for (const l of reauthListeners) {
    try {
      l();
    } catch {
      // listener errors must not block other listeners
    }
  }
}

export type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  /** 'offline' | 'timeout' | 'aborted' | error message; absent when ok */
  error?: string;
};

export async function api<T>(
  path: string,
  init?: RequestInit & { auth?: boolean; silent401?: boolean; signal?: AbortSignal },
): Promise<ApiResult<T>> {
  const token = init?.auth === false ? null : await getToken();
  const headers = new Headers(init?.headers);
  if (!headers.has('content-type') && init?.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const userSignal = init?.signal;
  if (userSignal) {
    if (userSignal.aborted) controller.abort();
    else userSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeoutId);
    const aborted = userSignal?.aborted === true;
    const timedOut = !aborted && controller.signal.aborted;
    const error = aborted
      ? 'aborted'
      : timedOut
        ? 'timeout'
        : err instanceof Error
          ? err.message
          : 'network_error';
    return { ok: false, status: 0, data: null, error };
  }
  clearTimeout(timeoutId);

  let data: T | null = null;
  if (res.headers.get('content-type')?.includes('application/json')) {
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
  }

  if (res.status === 401 && init?.auth !== false && !init?.silent401) {
    // Token is no longer valid — drop it locally and let the root layout
    // redirect to /login. Screens see status=401, but they won't be re-mounted
    // because the reauth listener replaces the navigation stack.
    await clearToken();
    emitReauth();
  }

  return { ok: res.ok, status: res.status, data };
}

export type LoginResult =
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'server_error'; status: number }
  | { kind: 'offline' };

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await api<{ ok: boolean; sessionToken?: string }>(`/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    headers: { 'x-client-mode': 'bearer' },
    auth: false,
  });
  if (result.ok && result.data?.sessionToken) {
    await setToken(result.data.sessionToken);
    return { kind: 'ok' };
  }
  if (result.status === 0) return { kind: 'offline' };
  if (result.status === 401 || result.status === 400) return { kind: 'invalid' };
  return { kind: 'server_error', status: result.status };
}

export type GoogleLoginResult =
  | { kind: 'success' }
  | { kind: 'cancel' }
  | { kind: 'error'; error: string };

export async function loginWithGoogle(): Promise<GoogleLoginResult> {
  const returnUrl = Linking.createURL('auth/callback');
  setOAuthLog(`start returnUrl=${returnUrl}`);
  const authUrl = `${API_BASE}/api/auth/google/start?mobile_redirect=${encodeURIComponent(returnUrl)}`;
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(authUrl, returnUrl);
  } catch (err) {
    setOAuthLog(`browser threw: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: 'error', error: err instanceof Error ? err.message : 'browser_failed' };
  }
  setOAuthLog(`result.type=${result.type} url=${('url' in result && result.url) || '<none>'}`);
  if (result.type === 'cancel' || result.type === 'dismiss') return { kind: 'cancel' };
  if (result.type !== 'success' || !result.url) return { kind: 'error', error: 'no_callback' };

  const parsed = Linking.parse(result.url);
  const params = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
  setOAuthLog(`parsed params keys=${Object.keys(params).join(',')}`);
  const errorParam = pickString(params.error);
  if (errorParam) {
    setOAuthLog(`callback returned error=${errorParam}`);
    return { kind: 'error', error: errorParam };
  }
  const token = pickString(params.token);
  if (!token) {
    setOAuthLog(`no token in callback url`);
    return { kind: 'error', error: 'no_token' };
  }
  try {
    await setToken(token);
  } catch (err) {
    setOAuthLog(`setToken threw: ${err instanceof Error ? err.message : String(err)}`);
    return { kind: 'error', error: 'store_failed' };
  }
  const readback = await getToken();
  setOAuthLog(`stored token len=${token.length}; readback ${readback ? 'ok' : 'NULL'}`);
  return { kind: 'success' };
}

function pickString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export type LogoutResult = { ok: true } | { ok: false; error: string };

export async function logout(): Promise<LogoutResult> {
  // Surface failures so the You-tab handler can warn the user that their
  // session may still be valid server-side. The token is cleared locally
  // either way — if the network call failed, the worst-case is a stale row
  // server-side, which will expire on its own.
  const result = await api('/api/auth/logout', { method: 'POST', silent401: true });
  await clearToken();
  if (result.ok || result.status === 401) return { ok: true };
  return { ok: false, error: result.error ?? `status_${result.status}` };
}

export const apiBase = API_BASE;
