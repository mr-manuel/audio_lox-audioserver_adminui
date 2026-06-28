import { API_BASE } from '../config/apiConfig';
import { requestJson, requestOk } from './http';
import type { PowerGroupConfig } from '@/domain/config/types';

export async function getConfig(): Promise<unknown> {
  return requestJson(`${API_BASE}/config`, {
    includeBodyInError: false,
    errorMessage: 'Failed to fetch configuration',
  });
}

export async function clearServerConfig(): Promise<void> {
  await requestOk(`${API_BASE}/config/clear`, {
    method: 'POST',
    includeBodyInError: false,
    errorMessage: 'Failed to clear configuration',
  });
}

export async function importServerConfig(config: unknown): Promise<void> {
  await requestOk(`${API_BASE}/config/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    errorMessage: 'Failed to import configuration',
  });
}

export async function reinitializeServer(): Promise<void> {
  await requestOk(`${API_BASE}/setup/reinitialize`, {
    method: 'POST',
    errorMessage: 'Failed to reinitialize',
  });
}

export async function updateAudioServerMacId(macId: string): Promise<void> {
  await requestOk(`${API_BASE}/config/system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioserver: { macId } }),
    errorMessage: 'Failed to update macId',
  });
}

export async function updateAudioServerIp(ip: string): Promise<void> {
  await requestOk(`${API_BASE}/config/system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioserver: { ip } }),
    errorMessage: 'Failed to update ip',
  });
}

export async function setDeploymentMode(mode: 'loxone' | 'standalone'): Promise<void> {
  await requestOk(`${API_BASE}/config/system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioserver: { mode } }),
    errorMessage: 'Failed to set deployment mode',
  });
}

export async function updateAuthEnabled(authEnabled: boolean): Promise<void> {
  await requestOk(`${API_BASE}/config/system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioserver: { authEnabled } }),
    errorMessage: 'Failed to update auth setting',
  });
}

export async function updateCrossfadeSec(crossfadeSec: number | undefined): Promise<void> {
  await requestOk(`${API_BASE}/config/system`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audioserver: { crossfadeSec: crossfadeSec ?? 0 } }),
    errorMessage: 'Failed to update crossfade setting',
  });
}

export async function updateGroupsConfig(payload: {
  mixedGroupEnabled?: boolean;
  powerGroups?: PowerGroupConfig[];
}): Promise<void> {
  await requestOk(`${API_BASE}/config/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to update groups config',
  });
}

type AdminUiUpdateResponse = {
  ok: boolean;
  release: string;
  distUrl: string;
  targetDir: string;
  updatedAt?: string;
};

export async function updateAdminUi(release?: string): Promise<AdminUiUpdateResponse> {
  return requestJson(`${API_BASE}/adminui/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: release ? JSON.stringify({ release }) : undefined,
    errorMessage: 'Failed to update Admin UI',
  });
}

// The player bundle is served from the same backend (public/player) and updated in place,
// mirroring the Admin UI flow — same response shape.
export async function updatePlayer(release?: string): Promise<AdminUiUpdateResponse> {
  return requestJson(`${API_BASE}/player/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: release ? JSON.stringify({ release }) : undefined,
    errorMessage: 'Failed to update Player',
  });
}

type ServerUpdateResponse = {
  ok: boolean;
  release: string;
  distUrl: string;
  targetDir: string;
  depsChanged?: boolean;
  restartRequired?: boolean;
  willRestart?: boolean;
  updatedAt?: string;
  error?: string;
};

// Updates the server core (dist/) in place. The backend resolves the release
// channel (stable/beta) from the running version when no tag is given, then
// swaps dist/, resyncs deps if the lockfile changed, and — when supervised —
// restarts itself. willRestart says whether the restart is automatic.
export async function updateServer(release?: string): Promise<ServerUpdateResponse> {
  return requestJson(`${API_BASE}/server/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: release ? JSON.stringify({ release }) : undefined,
    errorMessage: 'Failed to update server',
  });
}

type ComponentUpdateResponse = {
  ok: boolean;
  name: string;
  requestedVersion: string | null;
  installed: string | null;
  declared: string | null;
  updatedAt?: string;
  error?: string;
};

export async function updateComponentPackage(name: string, version?: string): Promise<ComponentUpdateResponse> {
  return requestJson(`${API_BASE}/components/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, version }),
    errorMessage: 'Failed to update component',
  });
}
