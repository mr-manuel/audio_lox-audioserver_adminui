import { API_BASE } from '../config/apiConfig';
import { requestJson } from './http';

/**
 * A Beoremote One bridge as the admin API reports it. Bridges register themselves
 * on the device-facing API; this read-only view is what the zone settings show so
 * a zone can pick which one drives it.
 */
export type BeoremoteBridge = {
  bridge_id: string;
  hostname?: string;
  version?: string;
  ip?: string;
  mac?: string;
  remote_mac?: string;
  last_seen?: string | null;
  connected: boolean;
  state: string | null;
  /** Zone that picked this bridge, derived server-side; null when unclaimed. */
  assigned_zone_id: number | null;
};

export async function getBeoremoteBridges(): Promise<BeoremoteBridge[]> {
  return requestJson<BeoremoteBridge[]>(`${API_BASE}/beoremote/bridges`, {
    errorMessage: 'Failed to fetch remotes',
  });
}

export type BeoremoteKeyBinding =
  | { kind: 'none' }
  | { kind: 'favorite'; slot: number }
  | { kind: 'lineIn'; inputId: string }
  | { kind: 'radio'; audiopath: string; name?: string };

/** Everything a key on this zone can be bound to, with names for the pickers. */
export type BeoremoteKeyOptions = {
  buttons: Array<{ button: string; code: string; defaultSlot: number }>;
  bindings: Record<string, BeoremoteKeyBinding>;
  favorites: Array<{ slot: number; name: string }>;
  lineIns: Array<{ id: string; name: string }>;
  radios: Array<{ audiopath: string; name: string }>;
};

export async function getBeoremoteKeyOptions(zoneId: number): Promise<BeoremoteKeyOptions> {
  return requestJson<BeoremoteKeyOptions>(`${API_BASE}/beoremote/zones/${zoneId}/keys`, {
    errorMessage: 'Failed to fetch remote buttons',
  });
}
