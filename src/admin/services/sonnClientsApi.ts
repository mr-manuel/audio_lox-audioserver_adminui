import { API_BASE, authHeaders, credentialsMode } from '../config/apiConfig';
import { requestJson } from './http';

/**
 * Speakers running Sonn Client.
 *
 * These devices hold no settings of their own: they report the sound cards they have and take
 * everything else from here. So this API carries three things at once per device — what it *is*
 * (registration, read-only hardware), what it is *doing* (status, live), and what it *should be*
 * (config, the only editable part). The view keeps them visually apart for the same reason.
 */

export type SonnCard = {
  id: string;
  name?: string;
  channels?: number;
  sample_rates?: number[];
  is_default?: boolean;
};

export type SonnRegistration = {
  deviceId: string;
  agent?: string;
  version?: string;
  hostname?: string;
  ip?: string;
  mac?: string;
  model?: string;
  os?: string;
  arch?: string;
  outputs: SonnCard[];
  inputs: SonnCard[];
  capabilities?: { codecs?: string[]; max_players?: number; features?: string[] };
  components?: Array<{ name?: string; version?: string | null; state?: string }>;
  registeredAt?: number;
};

export type SonnPlayerStatus = {
  client_id: string;
  state: string;
  output?: string;
  codec?: string;
  sample_rate?: number;
  bit_depth?: number;
  channels?: number;
  volume?: number;
  muted?: boolean;
  static_delay_ms?: number;
  clock_rtt_ms?: number;
  clock_quality?: string;
  last_error?: string | null;
};

export type SonnSourceStatus = {
  client_id: string;
  state: string;
  input?: string;
  level?: number;
  signal?: string;
  last_error?: string | null;
};

export type SonnStatus = {
  state?: string;
  version?: string;
  uptime_s?: number;
  players?: SonnPlayerStatus[];
  sources?: SonnSourceStatus[];
  components?: Array<{ name?: string; version?: string | null; state?: string; last_error?: string }>;
  pairing?: { state?: string; address?: string; name?: string; message?: string };
  beoremote?: {
    state?: string;
    zone_id?: number;
    menu_revision?: string;
    hid_connected?: boolean;
    last_error?: string;
  };
};

export type SonnPlayerConfig = {
  clientId: string;
  name?: string;
  output?: string;
  enabled?: boolean;
  delayMs?: number;
  volume?: number;
  muted?: boolean;
  volumeHook?: string;
  /** Where the speaker applies volume. Absent means the device decides. */
  volumeControl?: 'auto' | 'software' | 'alsa' | 'hook';
  mixerElement?: string;
  mixerMapped?: boolean;
  codecs?: string[];
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  bufferMs?: number;
  requiredLeadTimeMs?: number;
};

export type SonnSourceConfig = {
  clientId: string;
  name?: string;
  input?: string;
  enabled?: boolean;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  frameMs?: number;
  thresholdDb?: number;
  holdMs?: number;
  controls?: string[];
  controlHook?: string;
  alwaysOn?: boolean;
};

export type SonnBeoremoteConfig = {
  enabled?: boolean;
  zoneId?: number;
  menuPollMs?: number;
  volumePlayer?: string;
  volumeStep?: number;
};

export type SonnDeviceConfig = {
  deviceId: string;
  name?: string;
  enabled?: boolean;
  players?: SonnPlayerConfig[];
  sources?: SonnSourceConfig[];
  beoremote?: SonnBeoremoteConfig | null;
  requiredComponents?: string[];
  lastSeen?: string;
  hostname?: string;
  ip?: string;
  mac?: string;
  model?: string;
  version?: string;
};

export type SonnDeviceView = {
  deviceId: string;
  online: boolean;
  config: SonnDeviceConfig | null;
  registration: SonnRegistration | null;
  status: SonnStatus | null;
  statusReceivedAt: string | null;
  queuedCommands: Array<{ command: string; args: string[] }>;
};

export type SonnComponentCatalogueEntry = {
  name: string;
  version?: string;
  urls?: Record<string, string>;
  sha256?: Record<string, string>;
};

export type SonnClientsResponse = {
  devices: SonnDeviceView[];
  components: SonnComponentCatalogueEntry[];
  pollIntervalMs?: number;
};

/** What a `PUT` accepts. Every key is optional: an omitted one is left as it was. */
export type SonnDeviceUpdate = {
  name?: string;
  enabled?: boolean;
  players?: SonnPlayerConfig[];
  sources?: SonnSourceConfig[];
  beoremote?: SonnBeoremoteConfig | null;
  requiredComponents?: string[];
};

/** A rejected write, with the server's reason kept intact so the view can name it. */
export class SonnClientError extends Error {
  public readonly code: string;
  /** Client ids still in use, when that is why the write was refused. */
  public readonly clientIds: string[];

  constructor(code: string, message: string, clientIds: string[] = []) {
    super(message);
    this.name = 'SonnClientError';
    this.code = code;
    this.clientIds = clientIds;
  }
}

async function parseError(res: Response): Promise<never> {
  const body = await res.json().catch(() => null);
  const code = typeof body?.error === 'string' ? body.error : `http-${res.status}`;
  const clientIds = Array.isArray(body?.clientIds) ? body.clientIds.filter((id: unknown) => typeof id === 'string') : [];
  throw new SonnClientError(code, code, clientIds);
}

export async function listSonnClients(): Promise<SonnClientsResponse> {
  const data = await requestJson<SonnClientsResponse>(`${API_BASE}/sonnclients`, {
    errorMessage: 'Could not load devices',
  });
  return {
    devices: Array.isArray(data.devices) ? data.devices : [],
    components: Array.isArray(data.components) ? data.components : [],
    pollIntervalMs: data.pollIntervalMs,
  };
}

export async function saveSonnClient(
  deviceId: string,
  update: SonnDeviceUpdate,
): Promise<SonnDeviceView> {
  const res = await fetch(`${API_BASE}/sonnclients/${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: credentialsMode(),
    body: JSON.stringify(update),
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as SonnDeviceView;
}

export async function forgetSonnClient(deviceId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sonnclients/${encodeURIComponent(deviceId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: credentialsMode(),
  });
  // 409 carries the client ids a zone still points at, which is the whole reason the user cannot
  // remove this device yet — so it has to survive as data, not as a message.
  if (!res.ok) await parseError(res);
}

export async function sendSonnClientCommand(
  deviceId: string,
  command: string,
  args: string[] = [],
): Promise<void> {
  const res = await fetch(`${API_BASE}/sonnclients/${encodeURIComponent(deviceId)}/commands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: credentialsMode(),
    body: JSON.stringify({ command, args }),
  });
  if (!res.ok) await parseError(res);
}

/** Catalogue name under which the client's own build is published. */
export const CLIENT_COMPONENT = 'sonn-client';

/**
 * Publish a client version for every device to install.
 *
 * A version number, not a set of files: the server reads the hashes off the release, and a version
 * whose builds are not all published is refused rather than half-applied.
 */
export async function setSonnClientVersion(version: string): Promise<void> {
  const res = await fetch(`${API_BASE}/sonnclients/client-version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: credentialsMode(),
    body: JSON.stringify({ version }),
  });
  if (!res.ok) await parseError(res);
}

/** A player's name as the UI should show it: its own, else the card, else the id. */
export function playerLabel(player: SonnPlayerConfig): string {
  return player.name?.trim() || player.output?.trim() || player.clientId;
}

/** A card's name as the UI should show it, falling back to the device id it reported. */
export function cardLabel(card: SonnCard): string {
  const name = card.name?.trim();
  if (!name || name === card.id) return card.id;
  return `${name} — ${card.id}`;
}

/**
 * Client id for a new player or source on a device.
 *
 * The first player takes the device id itself, which is what the client defaults to; later ones get
 * a suffix. Stability is the point: a zone's output points at this string, so it must not change
 * when the user renames the room.
 */
export function nextClientId(device: SonnDeviceView, kind: 'player' | 'source'): string {
  const used = new Set([
    ...(device.config?.players ?? []).map((player) => player.clientId),
    ...(device.config?.sources ?? []).map((source) => source.clientId),
  ]);
  const base = kind === 'player' ? device.deviceId : `${device.deviceId}-in`;
  if (!used.has(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}
