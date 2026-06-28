export type AudioServerEntry = {
  macId: string;
  name: string | null;
  host: string | null;
  ip: string | null;
  port: number | null;
  uuid: string | null;
  master: string | null;
  isSelf: boolean;
  // True when this server advertises itself as lox-audioserver over mDNS (i.e. runs this admin).
  // Real Loxone audioservers share the protocol but lack the service → false; the admin switcher
  // filters on this so it never offers a server it can't actually administer. (The player ignores
  // it and lists everything.)
  isSonnCore: boolean;
};

export type AudioServersResponse = {
  self: string | null;
  servers: AudioServerEntry[];
};

// Discovery always queries the ORIGIN server (where this bundle was served from), not the active
// API base. The origin is same-origin (no CORS), runs the backend the UI was built against, and
// exposes /audioservers publicly — so the switcher works even while pointed at a peer whose own
// (possibly older) backend would reject the call, leaving a way back instead of stranding the UI.
const ORIGIN_AUDIOSERVERS = '/admin/api/audioservers';

/** Lists every audioserver the Miniserver pushed into the origin server's config (peers + self). */
export async function fetchAudioServers(): Promise<AudioServersResponse> {
  const res = await fetch(ORIGIN_AUDIOSERVERS, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load audioservers (${res.status})`);
  }
  return (await res.json()) as AudioServersResponse;
}
