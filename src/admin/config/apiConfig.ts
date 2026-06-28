// The admin UI normally talks to its own backend at the same origin (`/admin/api`).
// To support switching to a *peer* audioserver (the Miniserver pushes every server's
// config to each one), the base can be re-pointed at an absolute peer URL. A peer is
// cross-origin, so the SameSite=Lax session cookie is not sent — we authenticate with a
// bearer token instead (the session id the login endpoint returns), stored per base.

const API_BASE_KEY = 'lox.admin.apiBase';
const TOKENS_KEY = 'lox.admin.tokens';
const DEFAULT_BASE = '/admin/api';

/** HTTP port every audioserver serves its admin UI / API on (fixed across the project). */
export const ADMIN_HTTP_PORT = 7090;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readStoredBase(): string {
  if (!isBrowser()) return DEFAULT_BASE;
  try {
    const stored = window.localStorage.getItem(API_BASE_KEY);
    return stored && stored.trim() ? stored : DEFAULT_BASE;
  } catch {
    return DEFAULT_BASE;
  }
}

// `let` (not `const`) so a switch updates the live binding all importers read through.
// eslint-disable-next-line prefer-const
export let API_BASE = readStoredBase();

/** True when the active base points at a remote peer (absolute URL) rather than same-origin. */
export function isRemoteBase(base: string = API_BASE): boolean {
  return /^https?:\/\//i.test(base);
}

/**
 * Credentials mode for a base. Same-origin includes the cookie; a remote peer must NOT, because
 * the backend's CORS sends `Access-Control-Allow-Origin: *`, which the browser rejects together
 * with credentialed requests — the bearer token authenticates the peer instead.
 */
export function credentialsMode(base: string = API_BASE): RequestCredentials {
  return isRemoteBase(base) ? 'omit' : 'include';
}

/** The admin API base URL for a peer reachable at `host`. */
export function buildAdminBaseForHost(host: string): string {
  return `http://${host}:${ADMIN_HTTP_PORT}/admin/api`;
}

/** Hostname of the server the active base currently talks to (the origin when same-origin). */
export function activeApiHost(): string | null {
  if (isRemoteBase(API_BASE)) {
    try {
      return new URL(API_BASE).hostname;
    } catch {
      return null;
    }
  }
  return typeof window !== 'undefined' ? window.location.hostname : null;
}

export function setApiBase(base: string): void {
  API_BASE = base && base.trim() ? base : DEFAULT_BASE;
  if (!isBrowser()) return;
  try {
    if (API_BASE === DEFAULT_BASE) {
      window.localStorage.removeItem(API_BASE_KEY);
    } else {
      window.localStorage.setItem(API_BASE_KEY, API_BASE);
    }
  } catch {
    // ignore storage errors
  }
}

export function resetApiBase(): void {
  setApiBase(DEFAULT_BASE);
}

// ---- Per-base bearer tokens ----

function readTokens(): Record<string, string> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeTokens(tokens: Record<string, string>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage errors
  }
}

/** Bearer token for a base, or null. Same-origin logins may have none (cookie suffices). */
export function getToken(base: string = API_BASE): string | null {
  return readTokens()[base] ?? null;
}

export function setToken(base: string, token: string): void {
  const tokens = readTokens();
  tokens[base] = token;
  writeTokens(tokens);
}

export function clearToken(base: string = API_BASE): void {
  const tokens = readTokens();
  if (base in tokens) {
    delete tokens[base];
    writeTokens(tokens);
  }
}

/** Authorization header for the active base, if we hold a token for it. */
export function authHeaders(base: string = API_BASE): Record<string, string> {
  const token = getToken(base);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Appends the bearer token as a `token` query param. EventSource/WebSocket can't set headers,
 * so cross-origin streams carry auth this way (same-origin keeps using the cookie).
 */
export function withAuthQuery(url: string, base: string = API_BASE): string {
  const token = getToken(base);
  if (!token) return url;
  return url + (url.includes('?') ? '&' : '?') + `token=${encodeURIComponent(token)}`;
}
