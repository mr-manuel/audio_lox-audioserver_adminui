import { API_BASE } from '../config/apiConfig';
import { requestJson, requestOk } from './http';
import type {
  ZoneEqualizerConfig,
  ZoneInputConfig,
  ZonePlaybackConfig,
  ZonePowerManagerConfig,
  ZoneTransportConfig,
  ZoneStateConfig,
} from '@/domain/config/types';

export type ZoneUpdatePayload = {
  id: number;
  inputs?: ZoneInputConfig;
  transports?: ZoneTransportConfig[];
  state?: ZoneStateConfig;
  powerManager?: ZonePowerManagerConfig | null;
  playback?: ZonePlaybackConfig | null;
  equalizer?: ZoneEqualizerConfig | null;
};

export type ZonePlaybackState = {
  id: number;
  name: string;
  title?: string;
  artist?: string;
  album?: string;
  sourceName?: string;
  station?: string;
  state?: string;
  updatedAt?: string | number | null;
  tech?: {
    input?: {
      kind?: string | null;
      format?: string | null;
      sampleRate?: number | null;
      channels?: number | null;
    } | null;
    output?: {
      profiles?: string[];
      sampleRate?: number;
      channels?: number;
      bitrate?: string;
      pcmBitDepth?: number;
      resampler?: string;
      resamplePrecision?: number;
      resampleCutoff?: number;
      httpProfile?: string;
      httpIcyEnabled?: boolean;
      httpIcyInterval?: number;
      httpIcyName?: string;
      prebufferBytes?: number;
      httpFallbackSeconds?: number;
    };
    inputProvider?: string | null;
    outputTarget?: string | null;
    outputs?: string[];
    transports?: string[];
    streams?: {
      mp3?: string | null;
      pcm?: string | null;
    };
    streamStats?: Array<{
      profile: string;
      bps?: number | null;
      bufferedBytes?: number;
      totalBytes?: number;
      lastUpdated?: number | null;
      subscribers?: number;
      restarts?: number;
      lastError?: string | null;
      lastErrorAt?: number | null;
      lastStderr?: string | null;
      lastStderrAt?: number | null;
      lastExitCode?: number | null;
      lastExitSignal?: string | null;
      lastExitAt?: number | null;
      subscriberDrops?: number;
      lastSubscriberDropAt?: number | null;
    }>;
    backpressure?: {
      drops: number;
      lastBytes: number;
      lastDropTs: number | null;
      recentDrops: number;
    } | null;
    sendspin?: {
      codec: string;
      sampleRate: number;
      channels: number;
      bitDepth: number;
      bufferCapacity?: number | null;
      leadUs?: number | null;
      targetLeadUs?: number | null;
      bufferedBytes?: number | null;
      leadUpdatedAt?: number | null;
      protocol?: string | null;
    };
  };
};

export type ZoneStatesResponse = {
  zones?: ZonePlaybackState[];
  system?: {
    now?: number;
    loadavg?: number[];
    uptimeSec?: number;
    clockOffsetMs?: number;
    cores?: number;
  };
};

// Standalone-only: create a new (empty) zone with just a name. The server allocates
// the id and seeds defaults; output/inputs are configured afterwards via updateZones.
export async function createZone(name: string): Promise<{ id: number; name: string } | null> {
  const res = await requestJson<{ zone?: { id: number; name: string } }>(`${API_BASE}/config/zones/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
    errorMessage: 'Failed to create zone',
  });
  return res?.zone ?? null;
}

// Standalone-only: delete a config zone and rebuild the running zone set.
export async function deleteZone(zoneId: number): Promise<void> {
  await requestOk(`${API_BASE}/config/zones/${zoneId}`, {
    method: 'DELETE',
    errorMessage: 'Failed to delete zone',
  });
}

export async function updateZones(zones: ZoneUpdatePayload[]): Promise<void> {
  await requestOk(`${API_BASE}/config/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones }),
    errorMessage: 'Failed to update zones',
  });
}

// clientId targets a specific Sendspin satellite's delay; omit it for the primary output. Either
// way the change is applied live (no output rebuild).
export async function setZoneOutputLatency(
  zoneId: number,
  latencyMs: number,
  clientId?: string,
): Promise<void> {
  await requestOk(`${API_BASE}/zones/${zoneId}/output-latency`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latencyMs, ...(clientId ? { clientId } : {}) }),
    errorMessage: 'Failed to update output latency',
  });
}

async function postZoneMaintenance(path: string, errorMessage: string): Promise<void> {
  await requestOk(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    errorMessage,
  });
}

export async function purgeFavorites(): Promise<void> {
  await postZoneMaintenance('/zones/favorites/purge', 'Failed to purge favorites');
}

export async function purgeRecents(): Promise<void> {
  await postZoneMaintenance('/zones/recents/purge', 'Failed to purge recently played items');
}

export async function purgeZoneFavorites(zoneId: number): Promise<void> {
  await postZoneMaintenance(`/zones/${zoneId}/favorites/purge`, 'Failed to purge favorites for this zone');
}

export async function purgeZoneRecents(zoneId: number): Promise<void> {
  await postZoneMaintenance(`/zones/${zoneId}/recents/purge`, 'Failed to purge recently played items for this zone');
}

export async function copyZoneFavorites(sourceZoneId: number, destinationZoneIds: number[]): Promise<void> {
  await requestOk(`${API_BASE}/zones/${sourceZoneId}/favorites/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinations: destinationZoneIds }),
    errorMessage: 'Failed to copy favorites',
  });
}

export async function fetchZoneStates(): Promise<{ map: Record<number, ZonePlaybackState>; system?: ZoneStatesResponse['system'] }> {
  const payload = await requestJson<ZoneStatesResponse | ZonePlaybackState[]>(
    `${API_BASE}/zones/states`,
    {
      includeBodyInError: false,
      errorMessage: 'Failed to fetch zone states',
    },
  );
  const list = Array.isArray((payload as any).zones)
    ? (payload as any).zones
    : Array.isArray(payload)
      ? payload
      : [];
  const map: Record<number, ZonePlaybackState> = {};
  list.forEach((entry: ZonePlaybackState) => {
    if (entry && typeof entry.id === 'number') {
      map[entry.id] = entry;
    }
  });
  return { map, system: (payload as any).system };
}
