import { API_BASE } from '../config/apiConfig';
import { requestJson, requestOk } from './http';

export type ContentUpdatePayload = {
  radio?: {
    tuneInUsername?: string | null;
    radioParadise?: { enabled?: boolean };
  };
  spotify?: {
    clientId?: string | null;
    cacheEnabled?: boolean;
    cacheSizeMb?: number;
  };
  library?: {
    enabled?: boolean;
    autoScan?: boolean;
  };
  tts?: {
    provider?:
      | { type: 'internal' }
      | {
          type: 'loxberry-tts';
          enabled?: boolean;
          host?: string;
          mqttPort?: number;
          protocol?: 'mqtt' | 'mqtts';
          username?: string;
          password?: string;
          httpBaseUrl?: string;
        };
    fallbackToInternal?: boolean;
  };
  /** DLNA/UPnP MediaServer that exposes browsable content to other devices. */
  mediaServer?: {
    enabled?: boolean;
    friendlyName?: string;
  };
};

export type OutputsUpdatePayload = Record<string, { enabled: boolean }>;

export type InputsUpdatePayload = {
  airplay?: { enabled?: boolean };
  spotify?: { enabled?: boolean };
  bluetooth?: { enabled?: boolean };
  dlna?: { enabled?: boolean };
  lineIn?: { inputs?: Array<Record<string, unknown>> | null };
};

export async function updateContentConfig(payload: ContentUpdatePayload): Promise<void> {
  await requestOk(`${API_BASE}/config/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to update content settings',
  });
}

export async function updateInputsConfig(payload: InputsUpdatePayload): Promise<void> {
  await requestOk(`${API_BASE}/config/inputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to update input settings',
  });
}

/** Availability of output types, keyed by output id — gates the zone picker. */
export async function updateOutputsConfig(payload: OutputsUpdatePayload): Promise<void> {
  await requestOk(`${API_BASE}/config/outputs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to update output settings',
  });
}

export type LibraryStatusResponse = {
  status: number;
  trackCount?: number | null;
  albumCount?: number | null;
  artistCount?: number | null;
};

export type LibraryCoverSample = {
  id: string;
  album: string;
  artist: string;
  coverurl: string;
};

export type LibraryStorageStatusResponse = {
  trackCount?: number | null;
  albumCount?: number | null;
  artistCount?: number | null;
};

export async function fetchLibraryStatus(): Promise<LibraryStatusResponse> {
  return requestJson(`${API_BASE}/content/library/status`, {
    errorMessage: 'Failed to fetch library status',
  });
}

export async function fetchLibraryCovers(limit = 8): Promise<{ covers?: LibraryCoverSample[] }> {
  return requestJson(`${API_BASE}/content/library/covers?limit=${encodeURIComponent(String(limit))}`, {
    errorMessage: 'Failed to fetch library covers',
  });
}

export async function fetchLibraryStorageStatus(storageId: string): Promise<LibraryStorageStatusResponse> {
  return requestJson(`${API_BASE}/content/library/storages/${encodeURIComponent(storageId)}/status`, {
    errorMessage: 'Failed to fetch library share status',
  });
}

export async function fetchLibraryStorageCovers(
  storageId: string,
  limit = 8,
): Promise<{ covers?: LibraryCoverSample[] }> {
  return requestJson(
    `${API_BASE}/content/library/storages/${encodeURIComponent(storageId)}/covers?limit=${encodeURIComponent(
      String(limit),
    )}`,
    {
      errorMessage: 'Failed to fetch library share covers',
    },
  );
}

export async function uploadLibraryAudio(
  filename: string,
  base64Data: string,
  relativePath?: string,
): Promise<void> {
  await requestOk(`${API_BASE}/content/library/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, relativePath, data: base64Data }),
    errorMessage: 'Failed to upload audio',
  });
}

export async function triggerLibraryRescan(): Promise<void> {
  await requestOk(`${API_BASE}/content/library/rescan`, {
    method: 'POST',
    errorMessage: 'Failed to trigger library rescan',
  });
}

export type LibraryDeleteResponse = {
  result?: {
    deletedTracks?: number;
    deletedFiles?: number;
    missingFiles?: number;
  };
};

export async function deleteLibraryTrack(audiopath: string): Promise<LibraryDeleteResponse> {
  return requestJson(`${API_BASE}/content/library/tracks`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audiopath }),
    errorMessage: 'Failed to remove track',
  });
}

export async function deleteLibraryAlbum(id: string): Promise<LibraryDeleteResponse> {
  return requestJson(`${API_BASE}/content/library/albums`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    errorMessage: 'Failed to remove album',
  });
}

export async function deleteLibraryArtist(id: string): Promise<LibraryDeleteResponse> {
  return requestJson(`${API_BASE}/content/library/artists`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
    errorMessage: 'Failed to remove artist',
  });
}

export async function fetchSpotifyAuthLink(): Promise<{ link?: string }> {
  return requestJson(`${API_BASE}/spotify/accounts/link`, {
    errorMessage: 'Failed to build Spotify auth link',
  });
}

export async function deleteSpotifyAccount(accountId: string): Promise<void> {
  await requestOk(`${API_BASE}/spotify/accounts/${encodeURIComponent(accountId)}`, {
    method: 'DELETE',
    errorMessage: 'Failed to remove Spotify account',
  });
}

export type SpotifyBridgeConfig = {
  id: string;
  label: string;
  provider: string;
  enabled?: boolean;
  host?: string;
  port?: number;
  apiKey?: string;
  developerToken?: string;
  userToken?: string;
  ytmusicCookie?: string;
  deezerArl?: string;
  tidalAccessToken?: string;
  tidalCountryCode?: string;
  youtubeApiKey?: string;
  soundcloudOauthToken?: string;
  registerAll?: boolean;
  mode?: 'source' | 'sink';
};

export type CreateSpotifyBridgePayload = {
  id?: string;
  label?: string;
  provider: string;
  host?: string;
  port?: number;
  apiKey?: string;
  developerToken?: string;
  userToken?: string;
  ytmusicCookie?: string;
  deezerArl?: string;
  tidalAccessToken?: string;
  tidalCountryCode?: string;
  youtubeApiKey?: string;
  soundcloudOauthToken?: string;
  registerAll?: boolean;
  mode?: 'source' | 'sink';
};

// Non-Spotify services are first-class streaming accounts, not "Spotify
// bridges" — that framing is a Loxone-adapter detail. The server exposes them
// under the neutral /content/services route (the /spotify/bridges alias still
// works, but new clients use the neutral one).
export async function createSpotifyBridge(payload: CreateSpotifyBridgePayload): Promise<{ bridge: SpotifyBridgeConfig }> {
  return requestJson(`${API_BASE}/content/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to add streaming service',
  });
}

export async function deleteSpotifyBridge(id: string): Promise<void> {
  await requestOk(`${API_BASE}/content/services/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    errorMessage: 'Failed to remove streaming service',
  });
}

export type CustomRadioEntry = {
  id: string;
  name: string;
  stream: string;
  coverurl?: string;
};

type CustomRadioListResponse = {
  stations?: CustomRadioEntry[];
};

export async function fetchCustomRadioStations(): Promise<CustomRadioListResponse> {
  return requestJson(`${API_BASE}/content/radio/custom`, {
    errorMessage: 'Failed to load custom stations',
  });
}

export async function createCustomRadioStation(payload: {
  name: string;
  stream: string;
  coverurl?: string;
}): Promise<CustomRadioEntry> {
  const data = await requestJson<{ station: CustomRadioEntry }>(`${API_BASE}/content/radio/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to add custom station',
  });
  return data.station;
}

export async function deleteCustomRadioStation(id: string): Promise<void> {
  await requestOk(`${API_BASE}/content/radio/custom/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    errorMessage: 'Failed to remove custom station',
  });
}

export type TuneInValidationResponse = {
  valid: boolean;
  presetCount?: number;
  error?: string;
  message?: string;
};

export async function validateTuneInUsername(username: string): Promise<TuneInValidationResponse> {
  return requestJson(`${API_BASE}/content/radio/tunein/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
    errorMessage: 'Failed to validate TuneIn username',
  });
}

export type LibraryStorage = {
  id: string;
  name: string;
  server: string;
  folder: string;
  type: string;
  username?: string;
  password?: string;
  guest?: boolean;
  options?: string;
};

type LibraryStorageListResponse = {
  storages?: LibraryStorage[];
};

export async function fetchLibraryStorages(): Promise<LibraryStorageListResponse> {
  return requestJson(`${API_BASE}/content/library/storages`, {
    errorMessage: 'Failed to load library shares',
  });
}

export type CreateLibraryStoragePayload = {
  name: string;
  server: string;
  folder: string;
  type: string;
  username?: string;
  password?: string;
  guest?: boolean;
  options?: string;
  id?: string;
};

type CreateLibraryStorageResponse = {
  storage: LibraryStorage;
};

export async function createLibraryStorage(
  payload: CreateLibraryStoragePayload,
): Promise<CreateLibraryStorageResponse> {
  return requestJson(`${API_BASE}/content/library/storages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    errorMessage: 'Failed to add library share',
  });
}

export async function deleteLibraryStorage(storageId: string): Promise<void> {
  await requestOk(`${API_BASE}/content/library/storages/${encodeURIComponent(storageId)}`, {
    method: 'DELETE',
    errorMessage: 'Failed to remove library share',
  });
}
