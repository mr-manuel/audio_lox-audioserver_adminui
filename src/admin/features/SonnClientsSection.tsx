import React from 'react';
import { useTranslation } from 'react-i18next';
// Sits inside Setup, so it wears Setup's form language (inputs, toggles, buttons). The tiles, the
// dialog and its rows are its own — and deliberately shaped like the Zones screen's.
import './SetupView.css';
import './SonnClientsSection.css';
import {
  listSonnClients,
  saveSonnClient,
  forgetSonnClient,
  sendSonnClientCommand,
  setSonnClientVersion,
  CLIENT_COMPONENT,
  nextClientId,
  cardLabel,
  cardName,
  cardSpec,
  splitCards,
  SonnClientError,
  type SonnCard,
  type SonnClientsResponse,
  type SonnDeviceView,
  type SonnPlayerConfig,
  type SonnPlayerStatus,
  type SonnSourceConfig,
  type SonnSourceStatus,
  type SonnBeoremoteConfig,
} from '../services/sonnClientsApi';
import { getConfig } from '../services/setupApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import { useUpdateCheck } from '../components/UpdateCheckContext';
import { compareSemver } from '../services/updateCheck';
import { useConfirm } from '../components/ConfirmDialog';
import InlineState from '../components/InlineState';
import Modal from '../components/Modal';
import { copyText } from '../utils/clipboard';

/**
 * Sonn Client devices, as a section of Setup.
 *
 * Sonn Client is an appliance layer: install it on a Raspberry Pi (or comparable hardware) and the
 * machine stops being a computer with an audio program on it and becomes a player that does one
 * thing. Which is why every setting lives here rather than there — a device holds nothing but its
 * own identity.
 *
 * Tucked into Setup rather than the navigation because most installations never have one: a
 * top-level entry would advertise a feature that only matters once there is a Pi in a room. And
 * Setup rather than Content, because these are not another source of music — they are this
 * installation's own machinery.
 *
 * The shape is a tile per device and a dialog behind it, which is what Zones does with rooms. That
 * is not decoration: the previous version put every setting of every device on the page at once, so
 * one Pi with one speaker was two screens of scrolling and a second device pushed the first out of
 * sight. A tile answers the two questions someone actually arrives with — is it there, and what is
 * it doing — and the dialog holds the rest.
 *
 * Three things stay strictly apart, in the tile and in the dialog: what a device *is* (model,
 * address, version — read-only, it told us), what it is *doing* (live, never editable), and what it
 * *should be* (the forms, the only part that saves).
 *
 * Assigning a room is deliberately not here. A speaker becomes an ordinary output, so it is picked
 * on the Zones screen; this section's job ends at creating and naming it — and at *showing* which
 * room ended up with it, because an installation where that answer takes hunting is one where
 * nobody dares change anything.
 */

type Draft = {
  name: string;
  players: SonnPlayerConfig[];
  sources: SonnSourceConfig[];
  beoremote: SonnBeoremoteConfig;
  requiredComponents: string[];
};

/** A room, as far as this screen needs to know one. */
type ZoneRef = { id: number; name: string };

/**
 * What the rest of the configuration already points at.
 *
 * The ids on this screen are stable, opaque strings — `sonn-beosound9000-a01ec20a` — because a
 * zone's output holds one and renaming a room must not move the audio. Useful, and unreadable: so
 * every place a device is spoken for is resolved back to the name of the thing that spoke for it.
 */
type Usage = {
  /** Speaker client id → the room whose output it is. */
  players: Record<string, ZoneRef>;
  /** Input client id → the name of the line-in it feeds. */
  sources: Record<string, string>;
  /** Device id → the room using its Bluetooth radio. */
  bluetooth: Record<string, ZoneRef>;
  /** Device id → the room its Beoremote drives. */
  remotes: Record<string, ZoneRef>;
  /** Every room by id, so a number stored on a device can still be named. */
  zones: Record<number, string>;
};

const EMPTY_USAGE: Usage = { players: {}, sources: {}, bluetooth: {}, remotes: {}, zones: {} };

const REFRESH_MS = 5_000;
const INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/sonn-audio/sonn-client/main/install.sh | sudo bash';

/** Which panel of the device dialog is on screen. */
type View =
  | { kind: 'main' }
  | { kind: 'player'; clientId: string }
  | { kind: 'source'; clientId: string }
  | { kind: 'remote' }
  | { kind: 'about' };

function draftFrom(device: SonnDeviceView): Draft {
  const config = device.config;
  return {
    name: config?.name ?? '',
    players: (config?.players ?? []).map((player) => ({ ...player })),
    sources: (config?.sources ?? []).map((source) => ({ ...source })),
    beoremote: { ...(config?.beoremote ?? {}) },
    requiredComponents: [...(config?.requiredComponents ?? [])],
  };
}

/**
 * What to send as the device's own remote entry.
 *
 * Which room a remote drives is a fact about the room, and the server reads it from there; the
 * device entry survives only for installations configured before that was true, plus the couple of
 * device-side details (which speaker the volume keys move) that still live here. So it is sent back
 * as it was found, and `enabled` is never raised on its own: the server refuses an enabled remote
 * with no room, which is exactly what a switch here could produce and nothing here could fix.
 */
function remotePayload(remote: SonnBeoremoteConfig): SonnBeoremoteConfig | null {
  const claimed = remote.enabled === true && typeof remote.zoneId === 'number';
  const carries =
    claimed ||
    Boolean(remote.volumePlayer) ||
    typeof remote.volumeStep === 'number' ||
    typeof remote.menuPollMs === 'number';
  return carries ? { ...remote, enabled: claimed } : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Read every reference to a Sendspin client or a Sonn Client device out of the server config.
 *
 * Mirrors what the server itself checks before letting a device be forgotten, so the screen and the
 * refusal agree on what "in use" means.
 */
function readUsage(raw: unknown): Usage {
  const config = asRecord(asRecord(raw).config);
  const usage: Usage = { players: {}, sources: {}, bluetooth: {}, remotes: {}, zones: {} };

  const zones = Array.isArray(config.zones) ? config.zones : [];
  for (const entry of zones) {
    const zone = asRecord(entry);
    const id = Number(zone.id);
    if (!Number.isFinite(id)) continue;
    const ref: ZoneRef = { id, name: text(zone.name) || `Zone ${id}` };
    usage.zones[id] = ref.name;

    const outputs = [zone.output, ...(Array.isArray(zone.transports) ? zone.transports : [])];
    for (const candidate of outputs) {
      const output = asRecord(candidate);
      const clientId = text(output.clientId);
      if (clientId) usage.players[clientId] = ref;
      // Satellites are either bare client ids or objects carrying one.
      for (const satellite of Array.isArray(output.satellites) ? output.satellites : []) {
        const satelliteId =
          typeof satellite === 'string' ? satellite.trim() : text(asRecord(satellite).clientId);
        if (satelliteId) usage.players[satelliteId] = ref;
      }
    }

    const inputs = asRecord(zone.inputs);
    const bluetooth = asRecord(inputs.bluetooth);
    if (bluetooth.enabled !== false && text(bluetooth.deviceId)) {
      usage.bluetooth[text(bluetooth.deviceId)] = ref;
    }
    const remote = asRecord(inputs.beoremote);
    if (remote.enabled !== false && text(remote.deviceId)) {
      usage.remotes[text(remote.deviceId)] = ref;
    }
  }

  const lineIns = asRecord(asRecord(config.inputs).lineIn);
  for (const entry of Array.isArray(lineIns.inputs) ? lineIns.inputs : []) {
    const input = asRecord(entry);
    const source = asRecord(input.source);
    if (text(source.type).toLowerCase() !== 'sendspin') continue;
    const clientId = text(source.clientId) || text(source.client_id);
    if (clientId) usage.sources[clientId] = text(input.name) || clientId;
  }

  return usage;
}

type Translate = ReturnType<typeof useTranslation>['t'];

function deviceTitle(device: SonnDeviceView, t: Translate): string {
  return (
    device.config?.name?.trim() ||
    device.registration?.hostname?.trim() ||
    device.config?.hostname?.trim() ||
    t('sonnClients.unnamed')
  );
}

/** A speaker's or input's name as the UI should show it: its own, else the card, else the id. */
function entryLabel(
  entry: { name?: string; output?: string; input?: string; clientId: string },
  cards: SonnCard[],
  t: Translate,
): string {
  const own = entry.name?.trim();
  if (own) return own;
  const cardId = entry.output ?? entry.input;
  const card = cards.find((candidate) => candidate.id === cardId);
  if (card) return cardName(card);
  if (cardId) return cardSpec(cardId);
  return t('sonnClients.unnamedEntry');
}

/** How one speaker's live reading reads as a line of text. */
function playerReadout(status: SonnPlayerStatus | undefined, t: Translate): string[] {
  if (!status) return [];
  const parts = [t(`sonnClients.states.${status.state}`, status.state)];
  if (status.codec) {
    const rate = status.sample_rate ? ` ${(status.sample_rate / 1000).toFixed(status.sample_rate % 1000 ? 1 : 0)} kHz` : '';
    const depth = status.bit_depth ? ` ${status.bit_depth} bit` : '';
    parts.push(`${status.codec.toUpperCase()}${rate}${depth}`);
  }
  if (typeof status.volume === 'number') parts.push(t('sonnClients.volumeAt', { percent: status.volume }));
  if (typeof status.clock_rtt_ms === 'number') parts.push(t('sonnClients.rtt', { ms: status.clock_rtt_ms.toFixed(1) }));
  if (status.last_error) parts.push(status.last_error);
  return parts;
}

function sourceReadout(status: SonnSourceStatus | undefined, t: Translate): string[] {
  if (!status) return [];
  const parts = [t(`sonnClients.states.${status.state}`, status.state)];
  if (status.signal) parts.push(t(`sonnClients.signal.${status.signal}`, status.signal));
  if (typeof status.level === 'number') parts.push(`${Math.round(status.level * 100)}%`);
  if (status.last_error) parts.push(status.last_error);
  return parts;
}

/** What a device is doing, in one line — the only question a tile has to answer at a glance. */
type Standing = { tone: 'playing' | 'ready' | 'quiet' | 'off'; title: string; detail: string };

function standingOf(device: SonnDeviceView, draft: Draft, t: Translate): Standing {
  // `enabled: false` is no longer something this screen offers to set — a box you are working on
  // gets unplugged, and a room that should be quiet is a room setting. It is still read, so a
  // config parked by an earlier build says so instead of looking broken.
  if (device.config?.enabled === false) {
    return { tone: 'off', title: t('sonnClients.standing.offTitle'), detail: t('sonnClients.standing.offDetail') };
  }
  if (!device.online) {
    return {
      tone: 'quiet',
      title: t('sonnClients.standing.awayTitle'),
      detail: device.statusReceivedAt
        ? t('sonnClients.lastSeen', { when: new Date(device.statusReceivedAt).toLocaleString() })
        : t('sonnClients.neverSeen'),
    };
  }

  const players = device.status?.players ?? [];
  const sources = device.status?.sources ?? [];
  const playing = players.find((player) => player.state === 'streaming');
  if (playing) {
    return {
      tone: 'playing',
      // The state word is already the title; what is left is the format and the clock.
      detail: playerReadout(playing, t).slice(1).join(' · '),
      title: t('sonnClients.standing.playingTitle'),
    };
  }
  const broken =
    players.find((player) => player.state === 'error' || player.last_error) ??
    sources.find((source) => source.state === 'error' || source.last_error);
  if (broken) {
    return {
      tone: 'quiet',
      title: t('sonnClients.standing.problemTitle'),
      detail: broken.last_error ?? t('sonnClients.standing.problemDetail'),
    };
  }
  if (draft.players.length === 0 && draft.sources.length === 0) {
    return {
      tone: 'quiet',
      title: t('sonnClients.standing.bareTitle'),
      detail: t('sonnClients.standing.bareDetail'),
    };
  }
  return {
    tone: 'ready',
    title: t('sonnClients.standing.readyTitle'),
    // What it is set up to do, since it is not doing anything yet.
    detail: [
      draft.players.length ? t('sonnClients.speakerCount', { count: draft.players.length }) : '',
      draft.sources.length ? t('sonnClients.inputCount', { count: draft.sources.length }) : '',
    ]
      .filter(Boolean)
      .join(' · '),
  };
}

/* ---------------------------------------------------------------- glyphs -- */

function SpeakerGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="2.5" width="14" height="19" rx="2.5" />
      <circle cx="12" cy="15" r="3.5" />
      <circle cx="12" cy="7" r="1.6" />
    </svg>
  );
}

function InputGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 3v6a3 3 0 0 0 6 0V3" />
      <path d="M12 12v5" />
      <path d="M7.5 21h9" />
    </svg>
  );
}

function RemoteGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="7" y="2.5" width="10" height="19" rx="3" />
      <circle cx="12" cy="8" r="1.4" />
      <path d="M10 13h4M10 17h4" />
    </svg>
  );
}

function BluetoothGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 7l10 10-5 4V3l5 4L7 17" />
    </svg>
  );
}

function BoxGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M6 15h4" />
      <circle cx="17" cy="15" r="1.3" />
    </svg>
  );
}

function Chevron(): JSX.Element {
  return (
    <svg className="sonn-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/* ------------------------------------------------------------- the screen -- */

export default function SonnClientsSection(): JSX.Element {
  const { t } = useTranslation();
  const { push } = useGlobalAlert();
  const { confirm } = useConfirm();
  // The same source the shell chip and the Setup screen read, so "update available" means one thing
  // everywhere rather than this screen having its own opinion.
  const { latest } = useUpdateCheck();

  const [data, setData] = React.useState<SonnClientsResponse | null>(null);
  const [usage, setUsage] = React.useState<Usage>(EMPTY_USAGE);
  const [error, setError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [dirty, setDirty] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [publishing, setPublishing] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [view, setView] = React.useState<View>({ kind: 'main' });
  const [installOpen, setInstallOpen] = React.useState(false);

  // Read inside the refresh without making it a dependency, so polling does not restart on a
  // keystroke.
  const dirtyRef = React.useRef<Record<string, boolean>>({});
  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const load = React.useCallback(async (): Promise<void> => {
    try {
      const response = await listSonnClients();
      setData(response);
      setError(null);
      // A device being edited keeps its draft: a refresh landing mid-edit that discarded typing
      // would make the poll interval feel like a bug.
      setDrafts((previous) => {
        const next = { ...previous };
        for (const device of response.devices) {
          if (!next[device.deviceId] || !dirtyRef.current[device.deviceId]) {
            next[device.deviceId] = draftFrom(device);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Which room holds which speaker changes on another screen, so it is read on arrival and after
  // anything here could have changed it — not on the status poll, which would be four requests a
  // minute for an answer that moves once a month.
  const loadUsage = React.useCallback(async (): Promise<void> => {
    try {
      setUsage(readUsage(await getConfig()));
    } catch {
      // Names are a courtesy here; without them the rows fall back to ids rather than the screen
      // failing to draw.
    }
  }, []);

  React.useEffect(() => {
    void load();
    void loadUsage();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load, loadUsage]);

  const devices = data?.devices ?? [];
  const open = openId ? (devices.find((device) => device.deviceId === openId) ?? null) : null;

  // A device forgotten in another browser tab must not leave an empty dialog behind.
  React.useEffect(() => {
    if (openId && data && !open) setOpenId(null);
  }, [openId, data, open]);

  const patch = (deviceId: string, change: Partial<Draft>): void => {
    setDrafts((previous) => ({
      ...previous,
      [deviceId]: { ...previous[deviceId], ...change } as Draft,
    }));
    setDirty((previous) => ({ ...previous, [deviceId]: true }));
  };

  const openDevice = (device: SonnDeviceView, next: View = { kind: 'main' }): void => {
    setDrafts((previous) => ({
      ...previous,
      [device.deviceId]: previous[device.deviceId] ?? draftFrom(device),
    }));
    setView(next);
    setOpenId(device.deviceId);
    void loadUsage();
  };

  const closeDevice = (): void => {
    setOpenId(null);
    setView({ kind: 'main' });
  };

  /** Drop the edits and close: the dialog is the only place that saves, so leaving means leaving. */
  const cancelDevice = (device: SonnDeviceView): void => {
    setDrafts((previous) => ({ ...previous, [device.deviceId]: draftFrom(device) }));
    setDirty((previous) => ({ ...previous, [device.deviceId]: false }));
    closeDevice();
  };

  const save = async (device: SonnDeviceView): Promise<void> => {
    const draft = drafts[device.deviceId];
    if (!draft) return;
    setSaving((previous) => ({ ...previous, [device.deviceId]: true }));
    try {
      await saveSonnClient(device.deviceId, {
        name: draft.name.trim() || undefined,
        players: draft.players,
        sources: draft.sources,
        beoremote: remotePayload(draft.beoremote),
        requiredComponents: draft.requiredComponents,
      });
      setDirty((previous) => ({ ...previous, [device.deviceId]: false }));
      await load();
      void loadUsage();
      closeDevice();
      push({ tone: 'success', message: t('sonnClients.saved') });
    } catch (err) {
      const code = err instanceof SonnClientError ? err.code : null;
      push({
        tone: 'error',
        message: code
          ? t(`sonnClients.errors.${code}`, t('sonnClients.errors.generic'))
          : t('sonnClients.errors.generic'),
      });
    } finally {
      setSaving((previous) => ({ ...previous, [device.deviceId]: false }));
    }
  };

  const forget = async (device: SonnDeviceView): Promise<void> => {
    const ok = await confirm({
      title: t('sonnClients.forgetTitle'),
      message: t('sonnClients.forgetMessage', { name: deviceTitle(device, t) }),
      confirmLabel: t('sonnClients.forget'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await forgetSonnClient(device.deviceId);
      closeDevice();
      await load();
    } catch (err) {
      if (err instanceof SonnClientError && err.code === 'device-in-use') {
        // Naming the rooms is the point: "in use" without them sends the user hunting.
        const rooms = err.clientIds
          .map((clientId) => usage.players[clientId]?.name ?? usage.sources[clientId] ?? clientId)
          .join(', ');
        push({ tone: 'error', message: t('sonnClients.errors.deviceInUse', { ids: rooms }) });
        return;
      }
      push({ tone: 'error', message: t('sonnClients.errors.generic') });
    }
  };

  const pairRemote = async (device: SonnDeviceView): Promise<void> => {
    try {
      await sendSonnClientCommand(device.deviceId, 'pair_remote');
      push({ tone: 'info', message: t('sonnClients.remote.pairingStarted') });
      await load();
    } catch {
      push({ tone: 'error', message: t('sonnClients.errors.generic') });
    }
  };

  const addPlayer = (device: SonnDeviceView): void => {
    const draft = drafts[device.deviceId] ?? draftFrom(device);
    const outputs = device.registration?.outputs ?? [];
    const { direct } = splitCards(outputs);
    const preselected = outputs.find((card) => card.is_default) ?? direct[0] ?? outputs[0];
    const clientId = nextClientId(withDraft(device, draft), 'player');
    setDrafts((previous) => ({
      ...previous,
      [device.deviceId]: {
        ...draft,
        players: [...draft.players, { clientId, output: preselected?.id, enabled: true }],
      },
    }));
    setDirty((previous) => ({ ...previous, [device.deviceId]: true }));
    setView({ kind: 'player', clientId });
    setOpenId(device.deviceId);
  };

  const addSource = (device: SonnDeviceView): void => {
    const draft = drafts[device.deviceId] ?? draftFrom(device);
    const inputs = device.registration?.inputs ?? [];
    const { direct } = splitCards(inputs);
    const preselected = inputs.find((card) => card.is_default) ?? direct[0] ?? inputs[0];
    const clientId = nextClientId(withDraft(device, draft), 'source');
    setDrafts((previous) => ({
      ...previous,
      [device.deviceId]: {
        ...draft,
        sources: [
          ...draft.sources,
          { clientId, input: preselected?.id, enabled: true, controls: ['activate', 'deactivate'] },
        ],
      },
    }));
    setDirty((previous) => ({ ...previous, [device.deviceId]: true }));
    setView({ kind: 'source', clientId });
    setOpenId(device.deviceId);
  };

  if (error && !data) {
    return <InlineState kind="error" title={t('sonnClients.errors.loadFailed')} message={error} />;
  }

  const publishedVersion = data?.components?.find((entry) => entry.name === CLIENT_COMPONENT)?.version;

  // The oldest thing actually running, because that is what "speakers run X" has to mean when they
  // disagree — a park where one speaker stayed behind is exactly what this is for.
  const versions = devices
    .map((device) => device.registration?.version)
    .filter((version): version is string => Boolean(version));
  const oldestRunning = [...versions].sort((a, b) => compareSemver(a, b))[0];
  const newestRunning = [...versions].sort((a, b) => compareSemver(b, a))[0];
  // Offered when the newest published build is ahead of what is running, or of what was last set:
  // a version that has been set but not taken yet is still work in progress, not an update.
  const behind = (current: string | undefined): boolean =>
    Boolean(latest.sonnClient && current && compareSemver(current, latest.sonnClient) === -1);
  const updateTarget = behind(oldestRunning) || behind(publishedVersion) ? latest.sonnClient : null;

  const publishVersion = async (version: string): Promise<void> => {
    setPublishing(true);
    try {
      await setSonnClientVersion(version);
      // Nothing is pushed: every speaker asks on its next poll and installs when it is not playing,
      // so the message says what will happen rather than claiming it has.
      push({ tone: 'info', message: t('sonnClients.version.published', { version }) });
      await load();
    } catch (err) {
      const code = err instanceof SonnClientError ? err.code : '';
      push({
        tone: 'error',
        message: code.startsWith('no-artifact')
          ? t('sonnClients.version.notPublished', { version })
          : t('sonnClients.version.failed'),
      });
    } finally {
      setPublishing(false);
    }
  };

  const onlineCount = devices.filter((device) => device.online).length;

  return (
    <div className="sonn-stack">
      {devices.length === 0 ? (
        /* Nothing has registered: the install line is the only thing to do, so it is the screen. */
        <section className="sonn-empty">
          <p className="sonn-empty__title">{t('sonnClients.emptyTitle')}</p>
          <p className="sonn-empty__body">{t('sonnClients.emptyBody')}</p>
          <div className="sonn-empty__cmd">
            <code className="sonn-install">{INSTALL_COMMAND}</code>
            <div className="sonn-install__row">
              <CopyCommandButton />
            </div>
          </div>
          <p className="sonn-empty__body">{t('sonnClients.emptyHint')}</p>
        </section>
      ) : (
        <>
          {/* The whole fleet in one line: how many there are, what they run, and the one action
              that applies to all of them at once. */}
          <section className={`sonn-fleet${updateTarget ? ' sonn-fleet--update' : ''}`}>
            <div className="sonn-fleet__main">
              <span className="sonn-fleet__title">
                {updateTarget
                  ? t('sonnClients.version.available', { version: updateTarget })
                  : t('sonnClients.fleet.title', { count: devices.length })}
              </span>
              <span className="sonn-fleet__desc">
                {updateTarget
                  ? t('sonnClients.version.hint')
                  : t('sonnClients.fleet.desc', {
                      online: onlineCount,
                      count: devices.length,
                      version:
                        oldestRunning && oldestRunning !== newestRunning
                          ? `${oldestRunning}–${newestRunning}`
                          : (oldestRunning ?? '—'),
                    })}
              </span>
            </div>
            {/* Adding a device lives on the dashed tile below and nowhere else: two buttons for one
                thing, a hand's width apart, only makes someone wonder what the difference is. */}
            {updateTarget ? (
              <div className="sonn-fleet__actions">
                <button
                  type="button"
                  className="setup-btn setup-btn--primary"
                  disabled={publishing}
                  onClick={() => void publishVersion(updateTarget)}
                >
                  {publishing ? t('sonnClients.version.publishing') : t('sonnClients.version.publish')}
                </button>
              </div>
            ) : null}
          </section>

          <div className="sonn-grid">
            {devices.map((device) => (
              <DeviceTile
                key={device.deviceId}
                device={device}
                draft={drafts[device.deviceId] ?? draftFrom(device)}
                usage={usage}
                behind={behind(device.registration?.version)}
                onOpen={(next) => openDevice(device, next)}
                onAddPlayer={() => addPlayer(device)}
                onForget={() => void forget(device)}
              />
            ))}
            <button type="button" className="sonn-add" onClick={() => setInstallOpen(true)}>
              <span className="sonn-add__icon" aria-hidden="true">
                +
              </span>
              {t('sonnClients.addTitle')}
            </button>
          </div>
        </>
      )}

      {open ? (
        <DeviceModal
          device={open}
          draft={drafts[open.deviceId] ?? draftFrom(open)}
          view={view}
          usage={usage}
          components={data?.components ?? []}
          dirty={Boolean(dirty[open.deviceId])}
          saving={Boolean(saving[open.deviceId])}
          onView={setView}
          onChange={(change) => patch(open.deviceId, change)}
          onAddPlayer={() => addPlayer(open)}
          onAddSource={() => addSource(open)}
          onPair={() => void pairRemote(open)}
          onForget={() => void forget(open)}
          onCancel={() => cancelDevice(open)}
          onSave={() => void save(open)}
        />
      ) : null}

      <InstallModal open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}

/** A device carrying the draft's speakers and inputs, for id allocation against unsaved edits. */
function withDraft(device: SonnDeviceView, draft: Draft): SonnDeviceView {
  return {
    ...device,
    config: {
      ...(device.config ?? { deviceId: device.deviceId }),
      players: draft.players,
      sources: draft.sources,
    },
  };
}

function CopyCommandButton(): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      className="setup-btn"
      onClick={() => {
        void copyText(INSTALL_COMMAND);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? t('sonnClients.copied') : t('sonnClients.copyCommand')}
    </button>
  );
}

/* --------------------------------------------------------------- the tile -- */

function DeviceTile({
  device,
  draft,
  usage,
  behind,
  onOpen,
  onAddPlayer,
  onForget,
}: {
  device: SonnDeviceView;
  draft: Draft;
  usage: Usage;
  behind: boolean;
  onOpen: (view?: View) => void;
  onAddPlayer: () => void;
  onForget: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const standing = standingOf(device, draft, t);
  const outputs = device.registration?.outputs ?? [];
  const inputs = device.registration?.inputs ?? [];
  const version = device.registration?.version ?? device.config?.version;

  const bluetoothZone = usage.bluetooth[device.deviceId];
  const bluetooth = device.status?.bluetooth;
  const phone = bluetooth?.devices?.find((entry) => entry.streaming) ?? bluetooth?.devices?.find((entry) => entry.connected);
  const remoteZone = usage.remotes[device.deviceId];
  const remoteState = device.status?.beoremote?.state;

  return (
    <article className={`sonn-tile${standing.tone === 'quiet' ? ' is-idle' : ''}`}>
      <header className="sonn-tile__head">
        <span className={`sonn-dot${device.online ? ' is-online' : ''}`} aria-hidden="true" />
        <div className="sonn-tile__head-text">
          <div className="sonn-tile__name">{deviceTitle(device, t)}</div>
          {/* Address first: it is the half that gets used, and the model string is long enough to
              eat the line on its own. */}
          <div className="sonn-tile__meta">
            {[device.registration?.ip ?? device.config?.ip, device.registration?.model ?? device.config?.model]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
        {version ? (
          <span className={`sonn-tile__ver${behind ? ' is-behind' : ''}`} title={behind ? t('sonnClients.tile.behind') : undefined}>
            {version}
          </span>
        ) : null}
      </header>

      {/* What it is doing. Also the way in: the dialog behind it holds everything else. */}
      <button
        type="button"
        className={`sonn-hero${standing.tone === 'playing' ? ' is-playing' : ''}${
          standing.tone === 'quiet' ? ' is-quiet' : ''
        }`}
        onClick={() => onOpen({ kind: 'main' })}
      >
        <span className="sonn-hero__icon" aria-hidden="true">
          <SpeakerGlyph />
        </span>
        <span className="sonn-hero__text">
          <span className="sonn-hero__state">{standing.title}</span>
          {standing.detail ? <span className="sonn-hero__detail">{standing.detail}</span> : null}
        </span>
        <Chevron />
      </button>

      {draft.players.length ? (
        <>
          <div className="sonn-tile__label">{t('sonnClients.players.title')}</div>
          {draft.players.map((player) => {
            const zone = usage.players[player.clientId];
            return (
              <button
                key={player.clientId}
                type="button"
                className="sonn-tile__row"
                onClick={() => onOpen({ kind: 'player', clientId: player.clientId })}
              >
                <span className="sonn-row__icon" aria-hidden="true">
                  <SpeakerGlyph />
                </span>
                <span className="sonn-tile__row-text">
                  <span className="sonn-tile__row-name">{entryLabel(player, outputs, t)}</span>
                  <span className={`sonn-tile__row-sum${zone ? '' : ' sonn-tile__row-sum--free'}`}>
                    {zone ? t('sonnClients.usage.inRoom', { room: zone.name }) : t('sonnClients.usage.noRoom')}
                  </span>
                </span>
                <Chevron />
              </button>
            );
          })}
        </>
      ) : (
        <button type="button" className="sonn-tile__add" disabled={!outputs.length} onClick={onAddPlayer}>
          {outputs.length ? t('sonnClients.players.add') : t('sonnClients.players.noCards')}
        </button>
      )}

      {draft.sources.length ? (
        <>
          <div className="sonn-tile__label">{t('sonnClients.sources.title')}</div>
          {draft.sources.map((source) => {
            const lineIn = usage.sources[source.clientId];
            return (
              <button
                key={source.clientId}
                type="button"
                className="sonn-tile__row"
                onClick={() => onOpen({ kind: 'source', clientId: source.clientId })}
              >
                <span className="sonn-row__icon" aria-hidden="true">
                  <InputGlyph />
                </span>
                <span className="sonn-tile__row-text">
                  <span className="sonn-tile__row-name">{entryLabel(source, inputs, t)}</span>
                  <span className={`sonn-tile__row-sum${lineIn ? '' : ' sonn-tile__row-sum--free'}`}>
                    {lineIn
                      ? t('sonnClients.usage.asLineIn', { name: lineIn })
                      : t('sonnClients.usage.noLineIn')}
                  </span>
                </span>
                <Chevron />
              </button>
            );
          })}
        </>
      ) : null}

      {bluetoothZone || remoteZone || remoteState ? (
        <div className="sonn-chips">
          {bluetoothZone ? (
            <span className={`sonn-chip${phone ? ' is-on' : ''}`} title={phone?.name ?? bluetoothZone.name}>
              <span className="sonn-chip__dot" aria-hidden="true" />
              {t('sonnClients.bluetooth.chip', { room: bluetoothZone.name })}
            </span>
          ) : null}
          {remoteZone || remoteState ? (
            <span className={`sonn-chip${remoteState === 'connected' ? ' is-on' : ''}${remoteState === 'error' ? ' is-warn' : ''}`}>
              <span className="sonn-chip__dot" aria-hidden="true" />
              {remoteZone
                ? t('sonnClients.remote.chip', { room: remoteZone.name })
                : t('sonnClients.remote.label')}
            </span>
          ) : null}
        </div>
      ) : null}

      <footer className="sonn-tile__foot">
        <button type="button" className="sonn-tile__action" onClick={() => onOpen({ kind: 'main' })}>
          {t('sonnClients.tile.settings')}
        </button>
        <button type="button" className="sonn-tile__action sonn-tile__action--danger" onClick={onForget}>
          {t('sonnClients.forget')}
        </button>
      </footer>
    </article>
  );
}

/* ------------------------------------------------------------- the dialog -- */

function DeviceModal({
  device,
  draft,
  view,
  usage,
  components,
  dirty,
  saving,
  onView,
  onChange,
  onAddPlayer,
  onAddSource,
  onPair,
  onForget,
  onCancel,
  onSave,
}: {
  device: SonnDeviceView;
  draft: Draft;
  view: View;
  usage: Usage;
  components: SonnClientsResponse['components'];
  dirty: boolean;
  saving: boolean;
  onView: (view: View) => void;
  onChange: (change: Partial<Draft>) => void;
  onAddPlayer: () => void;
  onAddSource: () => void;
  onPair: () => void;
  onForget: () => void;
  onCancel: () => void;
  onSave: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const outputs = device.registration?.outputs ?? [];
  const inputs = device.registration?.inputs ?? [];

  const player = view.kind === 'player' ? draft.players.find((entry) => entry.clientId === view.clientId) : undefined;
  const source = view.kind === 'source' ? draft.sources.find((entry) => entry.clientId === view.clientId) : undefined;
  // A panel whose speaker was just removed falls back rather than showing an empty form.
  const resolved: View =
    (view.kind === 'player' && !player) || (view.kind === 'source' && !source) ? { kind: 'main' } : view;

  const heading = ((): { eyebrow: string; title: string; subtitle: React.ReactNode } => {
    if (resolved.kind === 'player' && player) {
      return {
        eyebrow: t('sonnClients.players.eyebrow'),
        title: entryLabel(player, outputs, t),
        subtitle: usage.players[player.clientId]
          ? t('sonnClients.usage.inRoom', { room: usage.players[player.clientId].name })
          : t('sonnClients.usage.noRoom'),
      };
    }
    if (resolved.kind === 'source' && source) {
      return {
        eyebrow: t('sonnClients.sources.eyebrow'),
        title: entryLabel(source, inputs, t),
        subtitle: usage.sources[source.clientId]
          ? t('sonnClients.usage.asLineIn', { name: usage.sources[source.clientId] })
          : t('sonnClients.usage.noLineIn'),
      };
    }
    if (resolved.kind === 'remote') {
      return {
        eyebrow: t('sonnClients.remote.eyebrow'),
        title: t('sonnClients.remote.title'),
        subtitle: t(
          `sonnClients.remote.states.${device.status?.beoremote?.state ?? 'disabled'}`,
          device.status?.beoremote?.state ?? '',
        ),
      };
    }
    if (resolved.kind === 'about') {
      return {
        eyebrow: t('sonnClients.about.eyebrow'),
        title: deviceTitle(device, t),
        subtitle: device.registration?.model ?? '',
      };
    }
    return {
      eyebrow: t('sonnClients.eyebrow'),
      title: deviceTitle(device, t),
      subtitle: (
        <>
          <span className={device.online ? 'sonn-modal__subtitle-on' : undefined}>
            {device.online ? t('sonnClients.online') : t('sonnClients.offline')}
          </span>
          {device.registration?.ip ? (
            <>
              {' '}
              <span className="sonn-modal__sep">·</span> {device.registration.ip}
            </>
          ) : null}
          {device.registration?.version ? (
            <>
              {' '}
              <span className="sonn-modal__sep">·</span> {device.registration.version}
            </>
          ) : null}
        </>
      ),
    };
  })();

  return (
    <Modal
      open
      onClose={onCancel}
      backdropClassName="sonn-modal-backdrop"
      dialogClassName="sonn-modal"
      ariaLabelledBy="sonn-modal-title"
      closeOnBackdrop={!dirty}
    >
      <header className="sonn-modal__head">
        {resolved.kind === 'main' ? null : (
          <button
            type="button"
            className="sonn-modal__back"
            onClick={() => onView({ kind: 'main' })}
            aria-label={t('sonnClients.back')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
        <div className="sonn-modal__head-text">
          <p className="sonn-modal__eyebrow">{heading.eyebrow}</p>
          <h3 id="sonn-modal-title" className="sonn-modal__title">
            {heading.title}
          </h3>
          <div className="sonn-modal__subtitle">{heading.subtitle}</div>
        </div>
        <button
          type="button"
          className="sonn-modal__close"
          onClick={onCancel}
          aria-label={t('sonnClients.close')}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="sonn-modal__body">
        {resolved.kind === 'main' ? (
          <MainPanel
            device={device}
            draft={draft}
            usage={usage}
            onView={onView}
            onChange={onChange}
            onAddPlayer={onAddPlayer}
            onAddSource={onAddSource}
          />
        ) : null}
        {resolved.kind === 'player' && player ? (
          <PlayerPanel
            device={device}
            draft={draft}
            player={player}
            usage={usage}
            onChange={onChange}
            onDone={() => onView({ kind: 'main' })}
          />
        ) : null}
        {resolved.kind === 'source' && source ? (
          <SourcePanel
            device={device}
            draft={draft}
            source={source}
            usage={usage}
            onChange={onChange}
            onDone={() => onView({ kind: 'main' })}
          />
        ) : null}
        {resolved.kind === 'remote' ? (
          <RemotePanel
            device={device}
            draft={draft}
            usage={usage}
            components={components}
            onChange={onChange}
            onPair={onPair}
          />
        ) : null}
        {resolved.kind === 'about' ? <AboutPanel device={device} /> : null}
      </div>

      <footer className="sonn-modal__foot">
        {resolved.kind === 'main' ? (
          <button type="button" className="sonn-modal__btn sonn-modal__btn--danger" onClick={onForget}>
            {t('sonnClients.forget')}
          </button>
        ) : null}
        <button type="button" className="sonn-modal__btn" onClick={onCancel}>
          {dirty ? t('sonnClients.discard') : t('sonnClients.close')}
        </button>
        <button
          type="button"
          className="sonn-modal__btn sonn-modal__btn--primary"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? t('sonnClients.saving') : t('sonnClients.save')}
        </button>
      </footer>
    </Modal>
  );
}

function MainPanel({
  device,
  draft,
  usage,
  onView,
  onChange,
  onAddPlayer,
  onAddSource,
}: {
  device: SonnDeviceView;
  draft: Draft;
  usage: Usage;
  onView: (view: View) => void;
  onChange: (change: Partial<Draft>) => void;
  onAddPlayer: () => void;
  onAddSource: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const outputs = device.registration?.outputs ?? [];
  const inputs = device.registration?.inputs ?? [];
  const bluetoothZone = usage.bluetooth[device.deviceId];
  const remoteZone = usage.remotes[device.deviceId];
  const remoteState = device.status?.beoremote?.state;

  return (
    <>
      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.device')}</span>
        </div>
        <div className="sonn-row">
          <span className="sonn-row__icon" aria-hidden="true">
            <BoxGlyph />
          </span>
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.deviceName')}</span>
            <span className="sonn-row__desc">{t('sonnClients.deviceNameDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <div className="setup-input" style={{ minWidth: 200 }}>
              <input
                type="text"
                value={draft.name}
                placeholder={device.registration?.hostname ?? ''}
                onChange={(event) => onChange({ name: event.target.value })}
              />
            </div>
          </span>
        </div>
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.players.title')}</span>
          <button type="button" className="setup-btn" disabled={!outputs.length} onClick={onAddPlayer}>
            {t('sonnClients.players.add')}
          </button>
        </div>
        {draft.players.length === 0 ? (
          /* Nothing set up yet is the one moment where what a speaker *is* still needs saying. */
          <>
            <p className="sonn-group__empty">
              {outputs.length ? t('sonnClients.players.empty') : t('sonnClients.players.noCards')}
            </p>
            <p className="sonn-note">{t('sonnClients.players.desc')}</p>
          </>
        ) : (
          draft.players.map((player) => {
            const zone = usage.players[player.clientId];
            const status = device.status?.players?.find((entry) => entry.client_id === player.clientId);
            return (
              <button
                key={player.clientId}
                type="button"
                className="sonn-row sonn-row--drill"
                onClick={() => onView({ kind: 'player', clientId: player.clientId })}
              >
                <span className="sonn-row__icon" aria-hidden="true">
                  <SpeakerGlyph />
                </span>
                <span className="sonn-row__text">
                  <span className="sonn-row__title">{entryLabel(player, outputs, t)}</span>
                  <span className={`sonn-row__sum${zone ? '' : ' sonn-row__sum--muted'}`}>
                    {zone ? t('sonnClients.usage.inRoom', { room: zone.name }) : t('sonnClients.usage.noRoom')}
                  </span>
                  {status ? <span className="sonn-row__desc">{playerReadout(status, t).join(' · ')}</span> : null}
                </span>
                <Chevron />
              </button>
            );
          })
        )}
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.sources.title')}</span>
          <button type="button" className="setup-btn" disabled={!inputs.length} onClick={onAddSource}>
            {t('sonnClients.sources.add')}
          </button>
        </div>
        {draft.sources.length === 0 ? (
          <>
            <p className="sonn-group__empty">
              {inputs.length ? t('sonnClients.sources.empty') : t('sonnClients.sources.noCards')}
            </p>
            <p className="sonn-note">{t('sonnClients.sources.desc')}</p>
          </>
        ) : (
          draft.sources.map((source) => {
            const lineIn = usage.sources[source.clientId];
            const status = device.status?.sources?.find((entry) => entry.client_id === source.clientId);
            return (
              <button
                key={source.clientId}
                type="button"
                className="sonn-row sonn-row--drill"
                onClick={() => onView({ kind: 'source', clientId: source.clientId })}
              >
                <span className="sonn-row__icon" aria-hidden="true">
                  <InputGlyph />
                </span>
                <span className="sonn-row__text">
                  <span className="sonn-row__title">{entryLabel(source, inputs, t)}</span>
                  <span className={`sonn-row__sum${lineIn ? '' : ' sonn-row__sum--muted'}`}>
                    {lineIn ? t('sonnClients.usage.asLineIn', { name: lineIn }) : t('sonnClients.usage.noLineIn')}
                  </span>
                  {status ? <span className="sonn-row__desc">{sourceReadout(status, t).join(' · ')}</span> : null}
                </span>
                <Chevron />
              </button>
            );
          })
        )}
        {/* Bluetooth lands here rather than beside the remote: a phone streaming in is an input
            like the socket above it, and that its own buttons steer the room is a property of that
            input. Read-only, because which room uses the radio is a fact about the room. */}
        <div className="sonn-row">
          <span className="sonn-row__icon" aria-hidden="true">
            <BluetoothGlyph />
          </span>
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.bluetooth.title')}</span>
            <span className={`sonn-row__sum${bluetoothZone ? '' : ' sonn-row__sum--muted'}`}>
              {bluetoothZone
                ? t('sonnClients.usage.forRoom', { room: bluetoothZone.name })
                : t('sonnClients.bluetooth.notSetUp')}
            </span>
            <span className="sonn-row__desc">{t('sonnClients.bluetooth.desc')}</span>
          </span>
        </div>
        <BluetoothReadout device={device} />
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.control')}</span>
        </div>
        <button
          type="button"
          className="sonn-row sonn-row--drill"
          onClick={() => onView({ kind: 'remote' })}
        >
          <span className="sonn-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.remote.title')}</span>
            <span className={`sonn-row__sum${remoteZone || remoteState ? '' : ' sonn-row__sum--muted'}`}>
              {remoteZone
                ? t('sonnClients.usage.drivesRoom', { room: remoteZone.name })
                : remoteState
                  ? t(`sonnClients.remote.states.${remoteState}`, remoteState)
                  : t('sonnClients.remote.notSetUp')}
            </span>
          </span>
          <Chevron />
        </button>
      </div>

      {/* One row, so no label: the row says what it is. */}
      <div className="sonn-group">
        <button type="button" className="sonn-row sonn-row--drill" onClick={() => onView({ kind: 'about' })}>
          <span className="sonn-row__icon" aria-hidden="true">
            <BoxGlyph />
          </span>
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.about.title')}</span>
            <span className="sonn-row__sum sonn-row__sum--muted">
              {[device.registration?.model, device.registration?.os].filter(Boolean).join(' · ') ||
                device.deviceId}
            </span>
          </span>
          <Chevron />
        </button>
      </div>
    </>
  );
}

/** What the radio reports: which phone, and what it is playing. Live, and never editable. */
function BluetoothReadout({ device }: { device: SonnDeviceView }): JSX.Element | null {
  const { t } = useTranslation();
  const bluetooth = device.status?.bluetooth;
  if (!bluetooth?.enabled) return null;
  const phones = bluetooth.devices ?? [];
  const active = phones.find((entry) => entry.streaming) ?? phones.find((entry) => entry.connected);
  const playing = bluetooth.now_playing;
  if (!active && !playing) return null;
  return (
    <p className="sonn-note">
      {active ? (
        <>
          <strong>{active.name}</strong>
          {' · '}
          {active.streaming
            ? t('sonnClients.bluetooth.streaming')
            : t('sonnClients.bluetooth.connected')}
        </>
      ) : null}
      {playing?.title ? (
        <>
          {active ? ' · ' : null}
          {[playing.artist, playing.title].filter(Boolean).join(' — ')}
        </>
      ) : null}
    </p>
  );
}

/** The sound-card picker: the direct devices first, every ALSA alias one group down. */
function CardSelect({
  cards,
  value,
  onChange,
  label,
}: {
  cards: SonnCard[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  label: string;
}): JSX.Element {
  const { t } = useTranslation();
  const { direct, aliases } = splitCards(cards);
  const known = cards.some((card) => card.id === value);
  return (
    <select
      className="sonn-select"
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || undefined)}
    >
      <option value="">{t('sonnClients.cards.default')}</option>
      {direct.length ? (
        <optgroup label={t('sonnClients.cards.direct')}>
          {direct.map((card) => (
            <option key={card.id} value={card.id}>
              {cardLabel(card)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {aliases.length ? (
        <optgroup label={t('sonnClients.cards.aliases')}>
          {aliases.map((card) => (
            <option key={card.id} value={card.id}>
              {cardLabel(card)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {/* A card the device no longer reports (a DAC that is unplugged) stays in the list, so saving
          does not quietly move the room to another output. */}
      {value && !known ? (
        <option value={value}>{t('sonnClients.cards.missing', { id: cardSpec(value) })}</option>
      ) : null}
    </select>
  );
}

/** The stable id a zone points at: shown, copyable, never editable. */
function ClientIdRow({ clientId, hint }: { clientId: string; hint: string }): JSX.Element {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="sonn-row sonn-row--block">
      <p className="sonn-note" style={{ padding: '0 0 8px' }}>
        {hint}
      </p>
      <span className="sonn-copy">
        <code className="sonn-mono">{clientId}</code>
        <button
          type="button"
          className="setup-btn"
          onClick={() => {
            void copyText(clientId);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? t('sonnClients.copied') : t('sonnClients.copyId')}
        </button>
      </span>
    </div>
  );
}

function PlayerPanel({
  device,
  draft,
  player,
  usage,
  onChange,
  onDone,
}: {
  device: SonnDeviceView;
  draft: Draft;
  player: SonnPlayerConfig;
  usage: Usage;
  onChange: (change: Partial<Draft>) => void;
  onDone: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const outputs = device.registration?.outputs ?? [];
  const status = device.status?.players?.find((entry) => entry.client_id === player.clientId);
  const zone = usage.players[player.clientId];
  const readout = playerReadout(status, t);

  const update = (change: Partial<SonnPlayerConfig>): void => {
    onChange({
      players: draft.players.map((entry) =>
        entry.clientId === player.clientId ? { ...entry, ...change } : entry,
      ),
    });
  };

  const remove = (): void => {
    onChange({ players: draft.players.filter((entry) => entry.clientId !== player.clientId) });
    onDone();
  };

  // The volume script only means anything once the speaker has been told to use it — but a script
  // already typed in stays visible, so nothing disappears behind a dropdown.
  const showHook = player.volumeControl === 'hook' || Boolean(player.volumeHook);
  const showScale = player.volumeControl !== 'software' && player.volumeControl !== 'hook';

  return (
    <>
      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.speaker')}</span>
        </div>
        {readout.length ? (
          <div className="sonn-readout sonn-readout--head">
            {readout.map((part, index) => (
              <span key={`${part}-${index}`} className="sonn-chip is-on">
                <span className="sonn-chip__dot" aria-hidden="true" />
                {part}
              </span>
            ))}
          </div>
        ) : null}
        {/* No name of its own. A speaker is already named twice over — by the box it lives in and by
            the room that plays it — and a third field only asked which of the three the Zones
            picker would show. It shows the device's name; the room's own name is on the Zones
            screen, where the room is. */}
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.players.card')}</span>
            <span className="sonn-row__desc">{t('sonnClients.players.cardDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <CardSelect
              cards={outputs}
              value={player.output}
              label={t('sonnClients.players.card')}
              onChange={(value) => update({ output: value })}
            />
          </span>
        </div>
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.volume')}</span>
        </div>
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.players.volumeControl')}</span>
            <span className="sonn-row__desc">{t('sonnClients.players.volumeControlDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <select
              className="sonn-select"
              aria-label={t('sonnClients.players.volumeControl')}
              value={player.volumeControl ?? 'auto'}
              onChange={(event) =>
                update({
                  volumeControl:
                    event.target.value === 'auto'
                      ? undefined
                      : (event.target.value as SonnPlayerConfig['volumeControl']),
                })
              }
            >
              <option value="auto">{t('sonnClients.players.volumeAuto')}</option>
              <option value="alsa">{t('sonnClients.players.volumeAlsa')}</option>
              <option value="software">{t('sonnClients.players.volumeSoftware')}</option>
              <option value="hook">{t('sonnClients.players.volumeHookOption')}</option>
            </select>
          </span>
        </div>
        {showScale ? (
          <div className="sonn-row">
            <span className="sonn-row__text">
              <span className="sonn-row__title">{t('sonnClients.players.volumeScale')}</span>
              <span className="sonn-row__desc">{t('sonnClients.players.volumeScaleDesc')}</span>
            </span>
            <span className="sonn-row__control">
              <select
                className="sonn-select"
                aria-label={t('sonnClients.players.volumeScale')}
                value={player.mixerMapped === undefined ? 'auto' : player.mixerMapped ? 'even' : 'own'}
                onChange={(event) =>
                  update({
                    mixerMapped: event.target.value === 'auto' ? undefined : event.target.value === 'even',
                  })
                }
              >
                <option value="auto">{t('sonnClients.players.volumeScaleAuto')}</option>
                <option value="even">{t('sonnClients.players.volumeScaleEven')}</option>
                <option value="own">{t('sonnClients.players.volumeScaleOwn')}</option>
              </select>
            </span>
          </div>
        ) : null}
        {showHook ? (
          <div className="sonn-row">
            <span className="sonn-row__text">
              <span className="sonn-row__title">{t('sonnClients.players.volumeHook')}</span>
              <span className="sonn-row__desc">{t('sonnClients.players.volumeHookDesc')}</span>
            </span>
            <span className="sonn-row__control">
              <div className="setup-input" style={{ minWidth: 220 }}>
                <input
                  type="text"
                  value={player.volumeHook ?? ''}
                  placeholder="/usr/local/bin/beolab-volume"
                  onChange={(event) => update({ volumeHook: event.target.value || undefined })}
                />
              </div>
            </span>
          </div>
        ) : null}
      </div>

      <div className="sonn-group">
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.players.removeTitle')}</span>
            <span className="sonn-row__desc">
              {zone
                ? t('sonnClients.players.removeInUse', { room: zone.name })
                : t('sonnClients.players.removeDesc')}
            </span>
          </span>
          <span className="sonn-row__control">
            <button type="button" className="setup-btn setup-btn--danger" onClick={remove}>
              {t('sonnClients.remove')}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function SourcePanel({
  device,
  draft,
  source,
  usage,
  onChange,
  onDone,
}: {
  device: SonnDeviceView;
  draft: Draft;
  source: SonnSourceConfig;
  usage: Usage;
  onChange: (change: Partial<Draft>) => void;
  onDone: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const inputs = device.registration?.inputs ?? [];
  const status = device.status?.sources?.find((entry) => entry.client_id === source.clientId);
  const lineIn = usage.sources[source.clientId];
  const readout = sourceReadout(status, t);

  const update = (change: Partial<SonnSourceConfig>): void => {
    onChange({
      sources: draft.sources.map((entry) =>
        entry.clientId === source.clientId ? { ...entry, ...change } : entry,
      ),
    });
  };

  const remove = (): void => {
    onChange({ sources: draft.sources.filter((entry) => entry.clientId !== source.clientId) });
    onDone();
  };

  return (
    <>
      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.input')}</span>
        </div>
        {readout.length ? (
          <div className="sonn-readout sonn-readout--head">
            {readout.map((part, index) => (
              <span key={`${part}-${index}`} className="sonn-chip is-on">
                <span className="sonn-chip__dot" aria-hidden="true" />
                {part}
              </span>
            ))}
          </div>
        ) : null}
        {/* Same as the speaker: the line-in this input feeds is already named, so it announces
            itself under that name (and under the device's until a line-in claims it). */}
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.sources.card')}</span>
            <span className="sonn-row__desc">{t('sonnClients.sources.cardDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <CardSelect
              cards={inputs}
              value={source.input}
              label={t('sonnClients.sources.card')}
              onChange={(value) => update({ input: value })}
            />
          </span>
        </div>
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.sources.controlHook')}</span>
            <span className="sonn-row__desc">{t('sonnClients.sources.controlHookDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <div className="setup-input" style={{ minWidth: 220 }}>
              <input
                type="text"
                value={source.controlHook ?? ''}
                placeholder="/usr/local/bin/ml-cmd"
                onChange={(event) => update({ controlHook: event.target.value || undefined })}
              />
            </div>
          </span>
        </div>
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.use')}</span>
        </div>
        {lineIn ? (
          <p className="sonn-note">{t('sonnClients.usage.sourceLineInNote', { name: lineIn })}</p>
        ) : (
          <ClientIdRow clientId={source.clientId} hint={t('sonnClients.usage.sourceFreeNote')} />
        )}
        {/* Silence detection and the capture format are set on the line-in this input feeds: that is
            where someone is thinking about the input, and having them in two places is how a rate
            typed on one screen was quietly overridden by a default on the other. */}
        <p className="sonn-note">{t('sonnClients.sources.configuredOnLineIn')}</p>
      </div>

      <div className="sonn-group">
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.sources.removeTitle')}</span>
            <span className="sonn-row__desc">
              {lineIn
                ? t('sonnClients.sources.removeInUse', { name: lineIn })
                : t('sonnClients.sources.removeDesc')}
            </span>
          </span>
          <span className="sonn-row__control">
            <button type="button" className="setup-btn setup-btn--danger" onClick={remove}>
              {t('sonnClients.remove')}
            </button>
          </span>
        </div>
      </div>
    </>
  );
}

function RemotePanel({
  device,
  draft,
  usage,
  components,
  onChange,
  onPair,
}: {
  device: SonnDeviceView;
  draft: Draft;
  usage: Usage;
  components: SonnClientsResponse['components'];
  onChange: (change: Partial<Draft>) => void;
  onPair: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const state = device.status?.beoremote?.state;
  const pairing = device.status?.pairing;
  // The room comes from the room's own settings; a device configured before that was possible still
  // carries one of its own, and that is the only case where this screen names the room itself.
  const legacyZoneId = draft.beoremote.enabled === true ? draft.beoremote.zoneId : undefined;
  const zone =
    usage.remotes[device.deviceId] ??
    (typeof legacyZoneId === 'number'
      ? { id: legacyZoneId, name: usage.zones[legacyZoneId] ?? `Zone ${legacyZoneId}` }
      : undefined);

  const setRemote = (change: Partial<SonnBeoremoteConfig>): void => {
    onChange({ beoremote: { ...draft.beoremote, ...change } });
  };

  return (
    <>
      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.remoteState')}</span>
        </div>
        <div className="sonn-readout sonn-readout--head">
          <span className={`sonn-chip${state === 'connected' ? ' is-on' : ''}`}>
            <span className="sonn-chip__dot" aria-hidden="true" />
            {state ? t(`sonnClients.remote.states.${state}`, state) : t('sonnClients.remote.notSetUp')}
          </span>
          {device.status?.beoremote?.hid_connected ? (
            <span className="sonn-chip is-on">
              <span className="sonn-chip__dot" aria-hidden="true" />
              {t('sonnClients.remote.keysConnected')}
            </span>
          ) : null}
          {zone ? (
            <span className="sonn-chip is-on">
              <span className="sonn-chip__dot" aria-hidden="true" />
              {t('sonnClients.usage.drivesRoom', { room: zone.name })}
            </span>
          ) : null}
          {pairing?.state ? (
            <span className="sonn-chip is-warn">
              <span className="sonn-chip__dot" aria-hidden="true" />
              {t(`sonnClients.pairing.${pairing.state}`, pairing.state)}
              {pairing.address ? ` · ${pairing.address}` : ''}
            </span>
          ) : null}
        </div>
        <p className="sonn-note">{t('sonnClients.remote.desc')}</p>
      </div>

      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.remoteSetup')}</span>
        </div>
        {draft.players.length > 1 ? (
          <div className="sonn-row">
            <span className="sonn-row__text">
              <span className="sonn-row__title">{t('sonnClients.remote.volumePlayer')}</span>
              <span className="sonn-row__desc">{t('sonnClients.remote.volumePlayerDesc')}</span>
            </span>
            <span className="sonn-row__control">
              <select
                className="sonn-select"
                aria-label={t('sonnClients.remote.volumePlayer')}
                value={draft.beoremote.volumePlayer ?? ''}
                onChange={(event) => setRemote({ volumePlayer: event.target.value || undefined })}
              >
                <option value="">{t('sonnClients.remote.firstPlayer')}</option>
                {draft.players.map((player) => (
                  <option key={player.clientId} value={player.clientId}>
                    {player.name?.trim() || player.clientId}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ) : null}
        <div className="sonn-row">
          <span className="sonn-row__text">
            <span className="sonn-row__title">{t('sonnClients.remote.pair')}</span>
            <span className="sonn-row__desc">{t('sonnClients.remote.pairDesc')}</span>
          </span>
          <span className="sonn-row__control">
            <button
              type="button"
              className="setup-btn"
              disabled={!device.online}
              onClick={onPair}
            >
              {t('sonnClients.remote.pair')}
            </button>
          </span>
        </div>
        <p className="sonn-note">{t('sonnClients.remote.assignOnZone')}</p>
      </div>
    </>
  );
}

/** What the device is, as it reported itself. Nothing here can be typed over. */
function AboutPanel({ device }: { device: SonnDeviceView }): JSX.Element {
  const { t } = useTranslation();
  const registration = device.registration;
  const facts: Array<[string, string]> = [
    [t('sonnClients.about.model'), registration?.model ?? device.config?.model ?? '—'],
    [t('sonnClients.about.host'), registration?.hostname ?? device.config?.hostname ?? '—'],
    [t('sonnClients.about.address'), registration?.ip ?? device.config?.ip ?? '—'],
    [t('sonnClients.about.mac'), registration?.mac ?? device.config?.mac ?? '—'],
    // Most builds already name the architecture in the OS string; only add it when they do not.
    [
      t('sonnClients.about.os'),
      [registration?.os, registration?.os?.includes(registration?.arch ?? '') ? '' : registration?.arch]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    [t('sonnClients.about.version'), registration?.version ?? device.config?.version ?? '—'],
    [
      t('sonnClients.about.uptime'),
      typeof device.status?.uptime_s === 'number'
        ? t('sonnClients.about.uptimeValue', { minutes: Math.max(1, Math.round(device.status.uptime_s / 60)) })
        : '—',
    ],
    [
      t('sonnClients.about.heard'),
      device.statusReceivedAt ? new Date(device.statusReceivedAt).toLocaleString() : t('sonnClients.neverSeen'),
    ],
  ];

  const installed = device.status?.components ?? registration?.components ?? [];

  return (
    <>
      <div className="sonn-group">
        <div className="sonn-group__head">
          <span className="sonn-group__label">{t('sonnClients.group.identity')}</span>
        </div>
        <div className="sonn-facts">
          {facts.map(([label, value]) => (
            <div key={label} className="sonn-facts__item">
              <span className="sonn-facts__label">{label}</span>
              <span className="sonn-facts__value">{value}</span>
            </div>
          ))}
        </div>
        <ClientIdRow clientId={device.deviceId} hint={t('sonnClients.about.idHint')} />
      </div>

      {installed.length ? (
        <div className="sonn-group">
          <div className="sonn-group__head">
            <span className="sonn-group__label">{t('sonnClients.about.software')}</span>
          </div>
          <div className="sonn-readout sonn-readout--head">
            {installed.map((entry) => (
              <span
                key={entry.name}
                className={`sonn-chip${entry.state === 'running' || entry.state === 'installed' ? ' is-on' : ''}${
                  entry.state === 'failed' ? ' is-warn' : ''
                }`}
              >
                <span className="sonn-chip__dot" aria-hidden="true" />
                {entry.name}
                {entry.version ? ` ${entry.version}` : ''}
                {' · '}
                {t(`sonnClients.components.${entry.state ?? 'absent'}`, entry.state ?? 'absent')}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** How a device gets here in the first place: one line, pasted into a terminal. */
function InstallModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <Modal
      open
      onClose={onClose}
      backdropClassName="sonn-modal-backdrop"
      dialogClassName="sonn-modal sonn-modal--narrow"
      ariaLabelledBy="sonn-install-title"
    >
      <header className="sonn-modal__head">
        <div className="sonn-modal__head-text">
          <p className="sonn-modal__eyebrow">{t('sonnClients.installEyebrow')}</p>
          <h3 id="sonn-install-title" className="sonn-modal__title">
            {t('sonnClients.addTitle')}
          </h3>
        </div>
        <button type="button" className="sonn-modal__close" onClick={onClose} aria-label={t('sonnClients.close')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>
      <div className="sonn-modal__body">
        <p className="sonn-fleet__desc">{t('sonnClients.addBody')}</p>
        <code className="sonn-install">{INSTALL_COMMAND}</code>
        <p className="sonn-note" style={{ padding: 0 }}>
          {t('sonnClients.emptyHint')}
        </p>
      </div>
      <footer className="sonn-modal__foot">
        <CopyCommandButton />
        <button type="button" className="sonn-modal__btn" onClick={onClose}>
          {t('sonnClients.close')}
        </button>
      </footer>
    </Modal>
  );
}
