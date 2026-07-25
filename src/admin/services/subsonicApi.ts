import { API_BASE } from '../config/apiConfig';
import { authHeaders, credentialsMode } from '../config/apiConfig';

/**
 * Everything the Subsonic panel needs, in one call. The server resolves the
 * derived bits (client URL, which services the allowlist actually exposes) so
 * the UI never re-derives them and drifts — see the admin handler for why.
 */
export type SubsonicStatus = {
  enabled: boolean;
  /** True when at least one credential source can admit a client. */
  configured: boolean;
  /** Accounts from the shared user store; managed under /users, not here. */
  users: Array<{ username: string; role?: string; [key: string]: unknown }>;
  /**
   * Which credential sources apply. A Miniserver account is enough in
   * Loxone-integrated mode; standalone has no Miniserver and needs local users.
   */
  auth: {
    loxone: boolean;
    loxoneUnavailableReason: 'standalone' | 'not-paired' | 'no-miniserver' | null;
    localUsers: boolean;
    localUsersRequired: boolean;
    /** Salted-token logins can only be answered from local credentials. */
    tokenAuthSupported: boolean;
  };
  /** The base URL to type into a client; clients append `/rest` themselves. */
  url: string;
  directoryLimit: number;
  directoryLimitBounds: { min: number; max: number };
  /** Provider allowlist as stored; null means "no restriction". */
  providers: string[] | null;
  providerOptions: Array<{ provider: string; label: string; enabled: boolean }>;
  services: Array<{
    key: string;
    provider: string;
    title: string;
    musicFolderId: number;
    exposed: boolean;
    searchable: boolean;
  }>;
  limitations: { persistsStarsAndRatings: boolean; writablePlaylists: boolean };
};

export type SubsonicConfigPayload = {
  enabled?: boolean;
  providers?: string[] | null;
  directoryLimit?: number | null;
};

/** A rejected write, with the server's machine-readable reason kept intact. */
export class SubsonicConfigError extends Error {
  public readonly code: string;
  public readonly detail: Record<string, unknown>;

  constructor(code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.name = 'SubsonicConfigError';
    this.code = code;
    this.detail = detail;
  }
}

function init(extra: RequestInit = {}): RequestInit {
  return {
    credentials: credentialsMode(),
    ...extra,
    headers: { ...authHeaders(), ...(extra.headers ?? {}) },
  };
}

export async function getSubsonicStatus(): Promise<SubsonicStatus> {
  const res = await fetch(`${API_BASE}/subsonic/status`, init());
  if (!res.ok) {
    throw new Error(`Failed to load Subsonic status (${res.status})`);
  }
  return (await res.json()) as SubsonicStatus;
}

/**
 * Writes the settings and returns the fresh status the endpoint responds with,
 * so a save needs no follow-up read. Validation failures come back as a
 * SubsonicConfigError carrying the server's `error` code.
 */
export async function updateSubsonicConfig(payload: SubsonicConfigPayload): Promise<SubsonicStatus> {
  const res = await fetch(
    `${API_BASE}/subsonic/config`,
    init({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string; [key: string]: unknown }
      | null;
    throw new SubsonicConfigError(
      body?.error ?? 'request-failed',
      body?.message ?? `Failed to save Subsonic settings (${res.status})`,
      body ?? {},
    );
  }
  return (await res.json()) as SubsonicStatus;
}
