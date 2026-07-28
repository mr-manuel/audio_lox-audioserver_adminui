import { API_BASE } from '../config/apiConfig';
import { requestJson } from './http';

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
