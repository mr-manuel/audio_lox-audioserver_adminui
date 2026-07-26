import { API_BASE, authHeaders, clearToken, credentialsMode, setToken } from '../config/apiConfig';

export type AdminSession = {
  username: string;
  loginAt: number;
  expiresAt: number;
};

const LAST_USER_KEY = 'lox.admin.lastUser';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function getLastAdminUsername(): string {
  if (!isBrowser()) return '';
  return window.localStorage.getItem(LAST_USER_KEY) ?? '';
}

function parseLoginError(raw: string): string {
  const sanitize = (text: string): string => text.replace(/miniserver/gi, 'controller');
  try {
    const parsed = JSON.parse(raw) as { error?: string; message?: string; miniserverHost?: string };
    const code = parsed.error ?? '';
    const host = typeof parsed.miniserverHost === 'string' ? parsed.miniserverHost.trim() : '';
    if (code === 'miniserver-auth-required') return 'Authentication starts after pairing is complete.';
    if (code === 'miniserver-not-configured') return 'Controller is not configured yet.';
    if (code === 'invalid-credentials') return 'Invalid username or password.';
    if (code === 'insufficient-permissions') return 'This user is not an admin account.';
    if (code === 'miniserver-unreachable') {
      return host
        ? `Cannot reach controller at ${host}. Check network and controller status.`
        : 'Cannot reach the controller right now. Check network and controller status.';
    }
    if (code === 'miniserver-protocol') {
      if (parsed.message && parsed.message.trim()) return `Authentication error: ${sanitize(parsed.message.trim())}`;
      return 'Controller responded with unexpected authentication data.';
    }
    if (code === 'invalid-auth-payload') return 'Enter username and password.';
    if (parsed.message && parsed.message.trim()) return sanitize(parsed.message.trim());
    if (code === 'auth-required') return 'Please sign in to continue.';
    if (code) return code;
    return sanitize(raw);
  } catch {
    return sanitize(raw) || 'Unable to sign in right now.';
  }
}

function parseAuthMe(raw: unknown): AdminSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Partial<AdminSession>;
  if (typeof payload.username !== 'string' || payload.username.trim().length === 0) return null;
  if (typeof payload.loginAt !== 'number' || !Number.isFinite(payload.loginAt)) return null;
  if (typeof payload.expiresAt !== 'number' || !Number.isFinite(payload.expiresAt)) return null;
  return {
    username: payload.username,
    loginAt: payload.loginAt,
    expiresAt: payload.expiresAt,
  };
}

/**
 * Logs in against a specific API base and stores the returned bearer token for that base.
 * Used both for the local server (base = API_BASE) and when switching to a peer audioserver,
 * which has its own session store and so needs its own login + token.
 */
export async function loginAdminAt(
  base: string,
  username: string,
  password: string,
): Promise<AdminSession> {
  const normalizedUser = username.trim();
  if (!normalizedUser) {
    throw new Error('Enter a username.');
  }
  if (!password.trim()) {
    throw new Error('Enter a password.');
  }

  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    credentials: credentialsMode(base),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: normalizedUser, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(parseLoginError(body || `Request failed (${response.status})`));
  }

  if (isBrowser()) {
    window.localStorage.setItem(LAST_USER_KEY, normalizedUser);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const token = (payload as { token?: unknown } | null)?.token;
  if (typeof token === 'string' && token) {
    setToken(base, token);
  }
  const parsed = parseAuthMe(payload);
  if (!parsed) {
    throw new Error('Authentication succeeded but session response was invalid.');
  }
  return parsed;
}

export async function loginAdmin(username: string, password: string): Promise<AdminSession> {
  return loginAdminAt(API_BASE, username, password);
}

/** First-run: create the local admin account and log straight in. The server
 *  refuses this once an admin exists, so it only ever bootstraps the first one. */
export async function setupAdmin(username: string, password: string): Promise<AdminSession> {
  const normalizedUser = username.trim();
  if (!normalizedUser) {
    throw new Error('Enter a username.');
  }
  if (!password.trim()) {
    throw new Error('Enter a password.');
  }

  const response = await fetch(`${API_BASE}/auth/setup`, {
    method: 'POST',
    credentials: credentialsMode(API_BASE),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: normalizedUser, password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(parseLoginError(body || `Request failed (${response.status})`));
  }

  if (isBrowser()) {
    window.localStorage.setItem(LAST_USER_KEY, normalizedUser);
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const token = (payload as { token?: unknown } | null)?.token;
  if (typeof token === 'string' && token) {
    setToken(API_BASE, token);
  }
  const parsed = parseAuthMe(payload);
  if (!parsed) {
    throw new Error('Setup succeeded but the response was invalid.');
  }
  return parsed;
}

export async function fetchAdminSession(): Promise<AdminSession | null> {
  const response = await fetch(`${API_BASE}/auth/me`, {
    method: 'GET',
    credentials: credentialsMode(),
    headers: { ...authHeaders() },
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(parseLoginError(body || `Request failed (${response.status})`));
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const parsed = parseAuthMe(payload);
  if (!parsed) return null;
  return parsed;
}

export async function logoutAdmin(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: credentialsMode(),
    headers: { ...authHeaders() },
  }).catch(() => undefined);
  clearToken(API_BASE);
}
