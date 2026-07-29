import { API_BASE } from '../config/apiConfig';
import { authHeaders, credentialsMode } from '../config/apiConfig';

/**
 * Everything the MQTT panel needs, in one call.
 *
 * Carries live connection state next to the saved settings, which matters more here
 * than for the other integrations: a broker address can save perfectly and still
 * never connect, so without `connected` and `lastError` a wrong password looks
 * exactly like a working setup.
 */
export type MqttStatus = {
  enabled: boolean;
  host: string;
  port: number | null;
  protocol: 'mqtt' | 'mqtts';
  username: string;
  /** The password itself is never sent back; this only says whether one is stored. */
  hasPassword: boolean;
  topicPrefix: string;
  publishProgress: boolean;
  /** Whether the broker connection is up right now. */
  connected: boolean;
  /** Why it is not connected, when it is not. */
  lastError: string | null;
  /** Messages published since connecting, as a sign of life. */
  published: number;
};

export type MqttConfigPayload = {
  enabled?: boolean;
  host?: string;
  port?: number | null;
  protocol?: 'mqtt' | 'mqtts';
  username?: string;
  /** Omit to keep the stored password; send an empty string to clear it. */
  password?: string;
  topicPrefix?: string;
  publishProgress?: boolean;
};

/** A rejected write, with the server's machine-readable reason kept intact. */
export class MqttConfigError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MqttConfigError';
    this.code = code;
  }
}

/**
 * The broker fields as the form edits them — strings, because a half-typed port is not
 * a number yet and an input that fights the keyboard is worse than one that validates
 * on save.
 */
export type MqttBrokerDraft = {
  host: string;
  port: string;
  username: string;
  /** Empty means "leave the stored password alone", never "clear it". */
  password: string;
  topicPrefix: string;
};

export function brokerDraftFrom(status: MqttStatus | null): MqttBrokerDraft {
  return {
    host: status?.host ?? '',
    port: status?.port ? String(status.port) : '',
    username: status?.username ?? '',
    password: '',
    topicPrefix: status?.topicPrefix ?? '',
  };
}

/** True when the form differs from what is saved, so Save can stay disabled until then. */
export function brokerDraftDirty(draft: MqttBrokerDraft, status: MqttStatus | null): boolean {
  const saved = brokerDraftFrom(status);
  return (
    draft.host.trim() !== saved.host ||
    draft.port.trim() !== saved.port ||
    draft.username.trim() !== saved.username ||
    draft.topicPrefix.trim() !== saved.topicPrefix ||
    draft.password.length > 0
  );
}

/** The payload for a draft, omitting an untouched password so it is not cleared. */
export function brokerPayload(draft: MqttBrokerDraft): MqttConfigPayload {
  const port = draft.port.trim();
  return {
    host: draft.host.trim(),
    port: port ? Number(port) : null,
    username: draft.username.trim(),
    ...(draft.password ? { password: draft.password } : {}),
    topicPrefix: draft.topicPrefix.trim(),
  };
}

function init(extra: RequestInit = {}): RequestInit {
  return {
    credentials: credentialsMode(),
    ...extra,
    headers: { ...authHeaders(), ...(extra.headers ?? {}) },
  };
}

export async function getMqttStatus(): Promise<MqttStatus> {
  const res = await fetch(`${API_BASE}/mqtt/status`, init());
  if (!res.ok) {
    throw new Error(`Failed to load MQTT status (${res.status})`);
  }
  return (await res.json()) as MqttStatus;
}

/**
 * Writes the settings and returns the fresh status the endpoint responds with, so a
 * save needs no follow-up read — and the returned `connected` already reflects
 * whether the new settings actually work.
 */
export async function updateMqttConfig(payload: MqttConfigPayload): Promise<MqttStatus> {
  const res = await fetch(
    `${API_BASE}/mqtt/config`,
    init({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    throw new MqttConfigError(
      body?.error ?? 'request-failed',
      body?.message ?? `Failed to save MQTT settings (${res.status})`,
    );
  }
  return (await res.json()) as MqttStatus;
}
