import React from 'react';
import { useTranslation } from 'react-i18next';
// Shares the admin form language (rows, inputs, toggles, notes) with Setup; the device cards and
// their status strip are this view's own.
import './SetupView.css';
import './SonnClientsView.css';
import {
  listSonnClients,
  saveSonnClient,
  forgetSonnClient,
  sendSonnClientCommand,
  nextClientId,
  cardLabel,
  SonnClientError,
  type SonnCard,
  type SonnClientsResponse,
  type SonnDeviceView,
  type SonnPlayerConfig,
  type SonnSourceConfig,
  type SonnBeoremoteConfig,
} from '../services/sonnClientsApi';
import { getConfig } from '../services/setupApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import { useConfirm } from '../components/ConfirmDialog';
import InlineState from '../components/InlineState';
import { copyText } from '../utils/clipboard';
import type { RootConfig } from '../types/config';

/**
 * Speakers running Sonn Client.
 *
 * A device here holds nothing but its own identity: it reports the sound cards it has and takes
 * every setting from this screen. So the card for one device shows three things, kept apart on
 * purpose — what it *is* (grey, read-only: model, address, version), what it is *doing* (the status
 * strip, live), and what it *should be* (the forms, the only part that saves).
 *
 * Assigning a room is deliberately not here. A player becomes an ordinary output, so it is picked on
 * the Zones screen — this screen's job is to create the output and name it.
 */

type Draft = {
  name: string;
  enabled: boolean;
  players: SonnPlayerConfig[];
  sources: SonnSourceConfig[];
  beoremote: SonnBeoremoteConfig;
  requiredComponents: string[];
};

type ZoneOption = { id: number; name: string };

const REFRESH_MS = 5_000;
const INSTALL_COMMAND =
  'curl -fsSL https://raw.githubusercontent.com/sonn-audio/sonn-client/main/install.sh | sudo bash';

function draftFrom(device: SonnDeviceView): Draft {
  const config = device.config;
  return {
    name: config?.name ?? '',
    enabled: config?.enabled !== false,
    players: (config?.players ?? []).map((player) => ({ ...player })),
    sources: (config?.sources ?? []).map((source) => ({ ...source })),
    beoremote: { ...(config?.beoremote ?? {}) },
    requiredComponents: [...(config?.requiredComponents ?? [])],
  };
}

/** Numbers come out of inputs as strings; an empty field means "unset", not zero. */
function numberOrUndefined(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function SonnClientsView(): JSX.Element {
  const { t } = useTranslation();
  const { push } = useGlobalAlert();
  const { confirm } = useConfirm();

  const [data, setData] = React.useState<SonnClientsResponse | null>(null);
  const [zones, setZones] = React.useState<ZoneOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [dirty, setDirty] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

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

  // Read inside the refresh without making it a dependency, so polling does not restart on a
  // keystroke.
  const dirtyRef = React.useRef<Record<string, boolean>>({});
  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  React.useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  React.useEffect(() => {
    void (async () => {
      try {
        const response = (await getConfig()) as { config?: RootConfig };
        const list: Array<{ id?: unknown; name?: unknown }> = Array.isArray(response.config?.zones)
          ? (response.config!.zones as Array<{ id?: unknown; name?: unknown }>)
          : [];
        setZones(
          list
            .map((zone) => ({ id: Number(zone.id), name: String(zone.name ?? '') }))
            .filter((zone) => Number.isFinite(zone.id)),
        );
      } catch {
        // The remote's zone picker is the only thing that needs this; an empty list leaves it
        // disabled rather than taking the whole screen down.
      }
    })();
  }, []);

  const patch = (deviceId: string, change: Partial<Draft>): void => {
    setDrafts((previous) => ({
      ...previous,
      [deviceId]: { ...previous[deviceId], ...change } as Draft,
    }));
    setDirty((previous) => ({ ...previous, [deviceId]: true }));
  };

  const save = async (device: SonnDeviceView): Promise<void> => {
    const draft = drafts[device.deviceId];
    if (!draft) return;
    setSaving((previous) => ({ ...previous, [device.deviceId]: true }));
    try {
      await saveSonnClient(device.deviceId, {
        name: draft.name.trim() || undefined,
        enabled: draft.enabled,
        players: draft.players,
        sources: draft.sources,
        beoremote: draft.beoremote.enabled ? draft.beoremote : null,
        requiredComponents: draft.requiredComponents,
      });
      setDirty((previous) => ({ ...previous, [device.deviceId]: false }));
      await load();
      push({ tone: 'success', message: t('sonnClients.saved') });
    } catch (err) {
      const code = err instanceof SonnClientError ? err.code : null;
      push({
        tone: 'error',
        message: code ? t(`sonnClients.errors.${code}`, t('sonnClients.errors.generic')) : t('sonnClients.errors.generic'),
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
      await load();
    } catch (err) {
      if (err instanceof SonnClientError && err.code === 'device-in-use') {
        // Naming the rooms is the point: "in use" without them sends the user hunting.
        push({
          tone: 'error',
          message: t('sonnClients.errors.deviceInUse', { ids: err.clientIds.join(', ') }),
        });
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

  if (error && !data) {
    return (
      <div className="setup-layout">
        <InlineState kind="error" title={t('sonnClients.errors.loadFailed')} message={error} />
      </div>
    );
  }

  const devices = data?.devices ?? [];

  return (
    <div className="setup-layout sonn-layout">
      <header className="setup-head">
        <div>
          <span className="setup-head__eyebrow">{t('sonnClients.eyebrow')}</span>
          <h1 className="setup-head__title">{t('sonnClients.title')}</h1>
          <p className="setup-head__subtitle">{t('sonnClients.subtitle')}</p>
        </div>
      </header>

      {devices.length === 0 ? (
        <section className="setup-section setup-section--full sonn-empty">
          <h2 className="setup-section__title">{t('sonnClients.emptyTitle')}</h2>
          <p className="setup-section__desc">{t('sonnClients.emptyBody')}</p>
          <div className="sonn-install">
            <code>{INSTALL_COMMAND}</code>
            <button type="button" className="setup-btn" onClick={() => void copyText(INSTALL_COMMAND)}>
              {t('sonnClients.copyCommand')}
            </button>
          </div>
          <p className="setup-note">{t('sonnClients.emptyNote')}</p>
        </section>
      ) : null}

      {devices.map((device) => {
        const draft = drafts[device.deviceId] ?? draftFrom(device);
        const outputs = device.registration?.outputs ?? [];
        const inputs = device.registration?.inputs ?? [];
        const isOpen = expanded[device.deviceId] ?? true;

        return (
          <section key={device.deviceId} className="setup-section setup-section--full sonn-device">
            <header className="sonn-device__head">
              <div className="sonn-device__identity">
                <span className={`sonn-dot${device.online ? ' is-online' : ''}`} aria-hidden="true" />
                <div>
                  <h2 className="setup-section__title">{deviceTitle(device, t)}</h2>
                  <p className="sonn-device__meta">
                    {[
                      device.registration?.model ?? device.config?.model,
                      device.registration?.hostname ?? device.config?.hostname,
                      device.registration?.ip ?? device.config?.ip,
                      device.registration?.version
                        ? t('sonnClients.versionLabel', { version: device.registration.version })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className="sonn-device__id">{device.deviceId}</p>
                </div>
              </div>
              <div className="sonn-device__actions">
                <button
                  type="button"
                  className="setup-btn"
                  onClick={() =>
                    setExpanded((previous) => ({ ...previous, [device.deviceId]: !isOpen }))
                  }
                >
                  {isOpen ? t('sonnClients.collapse') : t('sonnClients.expand')}
                </button>
                <button type="button" className="setup-btn setup-btn--danger" onClick={() => void forget(device)}>
                  {t('sonnClients.forget')}
                </button>
                <button
                  type="button"
                  className="setup-btn setup-btn--primary"
                  disabled={!dirty[device.deviceId] || saving[device.deviceId]}
                  onClick={() => void save(device)}
                >
                  {saving[device.deviceId] ? t('sonnClients.saving') : t('sonnClients.save')}
                </button>
              </div>
            </header>

            <StatusStrip device={device} />

            {isOpen ? (
              <>
                <div className="setup-rows">
                  <div className="setup-row">
                    <div className="setup-row__info">
                      <div className="setup-row__label">{t('sonnClients.deviceName')}</div>
                      <div className="setup-row__desc">{t('sonnClients.deviceNameDesc')}</div>
                    </div>
                    <div className="setup-row__control">
                      <div className="setup-input" style={{ minWidth: 220 }}>
                        <input
                          type="text"
                          value={draft.name}
                          placeholder={device.registration?.hostname ?? ''}
                          onChange={(event) => patch(device.deviceId, { name: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="setup-row">
                    <div className="setup-row__info">
                      <div className="setup-row__label">{t('sonnClients.deviceEnabled')}</div>
                      <div className="setup-row__desc">{t('sonnClients.deviceEnabledDesc')}</div>
                    </div>
                    <div className="setup-row__control">
                      <button
                        type="button"
                        className={`setup-toggle${draft.enabled ? ' is-on' : ''}`}
                        aria-pressed={draft.enabled}
                        onClick={() => patch(device.deviceId, { enabled: !draft.enabled })}
                      >
                        <span />
                      </button>
                    </div>
                  </div>
                </div>

                <PlayerList
                  device={device}
                  draft={draft}
                  outputs={outputs}
                  onChange={(players) => patch(device.deviceId, { players })}
                />

                <SourceList
                  device={device}
                  draft={draft}
                  inputs={inputs}
                  onChange={(sources) => patch(device.deviceId, { sources })}
                />

                <RemoteSection
                  device={device}
                  draft={draft}
                  zones={zones}
                  components={data?.components ?? []}
                  onChange={(change) => patch(device.deviceId, change)}
                  onPair={() => void pairRemote(device)}
                />
              </>
            ) : null}
          </section>
        );
      })}
    </div>
  );
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

/** What the device is doing right now. Live, and never editable. */
function StatusStrip({ device }: { device: SonnDeviceView }): JSX.Element {
  const { t } = useTranslation();
  const status = device.status;
  const players = status?.players ?? [];
  const sources = status?.sources ?? [];
  const pairing = status?.pairing;

  if (!device.online) {
    return (
      <div className="sonn-status sonn-status--offline">
        {device.statusReceivedAt
          ? t('sonnClients.lastSeen', { when: new Date(device.statusReceivedAt).toLocaleString() })
          : t('sonnClients.neverSeen')}
      </div>
    );
  }

  return (
    <div className="sonn-status">
      {players.map((player) => (
        <span key={player.client_id} className="sonn-chip">
          <strong>{player.client_id}</strong>
          {' · '}
          {t(`sonnClients.states.${player.state}`, player.state)}
          {player.codec
            ? ` · ${player.codec.toUpperCase()} ${player.sample_rate ?? ''}${player.sample_rate ? 'Hz' : ''}`
            : ''}
          {typeof player.clock_rtt_ms === 'number'
            ? ` · ${t('sonnClients.rtt', { ms: player.clock_rtt_ms.toFixed(1) })}`
            : ''}
          {player.last_error ? ` · ${player.last_error}` : ''}
        </span>
      ))}
      {sources.map((source) => (
        <span key={source.client_id} className="sonn-chip">
          <strong>{source.client_id}</strong>
          {' · '}
          {t(`sonnClients.states.${source.state}`, source.state)}
          {source.signal ? ` · ${t(`sonnClients.signal.${source.signal}`, source.signal)}` : ''}
          {typeof source.level === 'number' ? ` · ${Math.round(source.level * 100)}%` : ''}
        </span>
      ))}
      {pairing?.state ? (
        <span className="sonn-chip sonn-chip--accent">
          {t(`sonnClients.pairing.${pairing.state}`, pairing.state)}
          {pairing.address ? ` · ${pairing.address}` : ''}
        </span>
      ) : null}
      {status?.beoremote?.state ? (
        <span className="sonn-chip">
          {t('sonnClients.remote.label')}
          {' · '}
          {t(`sonnClients.remote.states.${status.beoremote.state}`, status.beoremote.state)}
          {status.beoremote.hid_connected ? ` · ${t('sonnClients.remote.keysConnected')}` : ''}
        </span>
      ) : null}
    </div>
  );
}

function PlayerList({
  device,
  draft,
  outputs,
  onChange,
}: {
  device: SonnDeviceView;
  draft: Draft;
  outputs: SonnCard[];
  onChange: (players: SonnPlayerConfig[]) => void;
}): JSX.Element {
  const { t } = useTranslation();

  const update = (index: number, change: Partial<SonnPlayerConfig>): void => {
    onChange(draft.players.map((player, current) => (current === index ? { ...player, ...change } : player)));
  };

  const add = (): void => {
    const preselected = outputs.find((card) => card.is_default) ?? outputs[0];
    onChange([
      ...draft.players,
      {
        clientId: nextClientId({ ...device, config: { ...(device.config ?? { deviceId: device.deviceId }), players: draft.players, sources: draft.sources } }, 'player'),
        output: preselected?.id,
        enabled: true,
      },
    ]);
  };

  return (
    <div className="sonn-group">
      <header className="sonn-group__head">
        <div>
          <h3>{t('sonnClients.players.title')}</h3>
          <p className="setup-section__desc">{t('sonnClients.players.desc')}</p>
        </div>
        <button type="button" className="setup-btn" onClick={add} disabled={!outputs.length}>
          {t('sonnClients.players.add')}
        </button>
      </header>

      {draft.players.length === 0 ? (
        <p className="setup-note">
          {outputs.length ? t('sonnClients.players.empty') : t('sonnClients.players.noCards')}
        </p>
      ) : null}

      {draft.players.map((player, index) => (
        <div key={player.clientId} className="sonn-entry">
          <div className="sonn-entry__head">
            <div className="setup-input" style={{ minWidth: 200 }}>
              <input
                type="text"
                value={player.name ?? ''}
                placeholder={t('sonnClients.players.namePlaceholder')}
                onChange={(event) => update(index, { name: event.target.value || undefined })}
              />
            </div>
            <button
              type="button"
              className="setup-btn setup-btn--danger"
              onClick={() => onChange(draft.players.filter((_, current) => current !== index))}
            >
              {t('sonnClients.remove')}
            </button>
          </div>

          {/* The id a zone points at. Shown, not editable: changing it after a room has been
              assigned would silently unassign that room. */}
          <p className="sonn-entry__id">{t('sonnClients.players.idLabel', { id: player.clientId })}</p>

          <div className="setup-rows">
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.players.card')}</div>
                <div className="setup-row__desc">{t('sonnClients.players.cardDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ minWidth: 260 }}>
                  <select
                    value={player.output ?? ''}
                    onChange={(event) => update(index, { output: event.target.value || undefined })}
                  >
                    <option value="">{t('sonnClients.players.defaultCard')}</option>
                    {outputs.map((card) => (
                      <option key={card.id} value={card.id}>
                        {cardLabel(card)}
                      </option>
                    ))}
                    {/* A card the device no longer reports (a DAC that is unplugged) stays in the
                        list, so saving does not quietly move the room to another output. */}
                    {player.output && !outputs.some((card) => card.id === player.output) ? (
                      <option value={player.output}>
                        {t('sonnClients.players.missingCard', { id: player.output })}
                      </option>
                    ) : null}
                  </select>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.players.delay')}</div>
                <div className="setup-row__desc">{t('sonnClients.players.delayDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ width: 140 }}>
                  <input
                    type="number"
                    min={0}
                    max={5000}
                    value={player.delayMs ?? ''}
                    onChange={(event) => update(index, { delayMs: numberOrUndefined(event.target.value) })}
                  />
                  <span className="setup-input__suffix">ms</span>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.players.volumeHook')}</div>
                <div className="setup-row__desc">{t('sonnClients.players.volumeHookDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ minWidth: 260 }}>
                  <input
                    type="text"
                    value={player.volumeHook ?? ''}
                    placeholder="/usr/local/bin/beolab-volume"
                    onChange={(event) => update(index, { volumeHook: event.target.value || undefined })}
                  />
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.players.enabled')}</div>
                <div className="setup-row__desc">{t('sonnClients.players.enabledDesc')}</div>
              </div>
              <div className="setup-row__control">
                <button
                  type="button"
                  className={`setup-toggle${player.enabled !== false ? ' is-on' : ''}`}
                  aria-pressed={player.enabled !== false}
                  onClick={() => update(index, { enabled: player.enabled === false })}
                >
                  <span />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SourceList({
  device,
  draft,
  inputs,
  onChange,
}: {
  device: SonnDeviceView;
  draft: Draft;
  inputs: SonnCard[];
  onChange: (sources: SonnSourceConfig[]) => void;
}): JSX.Element {
  const { t } = useTranslation();

  const update = (index: number, change: Partial<SonnSourceConfig>): void => {
    onChange(draft.sources.map((source, current) => (current === index ? { ...source, ...change } : source)));
  };

  const add = (): void => {
    const preselected = inputs.find((card) => card.is_default) ?? inputs[0];
    onChange([
      ...draft.sources,
      {
        clientId: nextClientId({ ...device, config: { ...(device.config ?? { deviceId: device.deviceId }), players: draft.players, sources: draft.sources } }, 'source'),
        input: preselected?.id,
        enabled: true,
        controls: ['activate', 'deactivate'],
      },
    ]);
  };

  return (
    <div className="sonn-group">
      <header className="sonn-group__head">
        <div>
          <h3>{t('sonnClients.sources.title')}</h3>
          <p className="setup-section__desc">{t('sonnClients.sources.desc')}</p>
        </div>
        <button type="button" className="setup-btn" onClick={add} disabled={!inputs.length}>
          {t('sonnClients.sources.add')}
        </button>
      </header>

      {draft.sources.length === 0 ? (
        <p className="setup-note">
          {inputs.length ? t('sonnClients.sources.empty') : t('sonnClients.sources.noCards')}
        </p>
      ) : null}

      {draft.sources.map((source, index) => (
        <div key={source.clientId} className="sonn-entry">
          <div className="sonn-entry__head">
            <div className="setup-input" style={{ minWidth: 200 }}>
              <input
                type="text"
                value={source.name ?? ''}
                placeholder={t('sonnClients.sources.namePlaceholder')}
                onChange={(event) => update(index, { name: event.target.value || undefined })}
              />
            </div>
            <button
              type="button"
              className="setup-btn setup-btn--danger"
              onClick={() => onChange(draft.sources.filter((_, current) => current !== index))}
            >
              {t('sonnClients.remove')}
            </button>
          </div>

          <p className="sonn-entry__id">{t('sonnClients.sources.idLabel', { id: source.clientId })}</p>

          <div className="setup-rows">
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.sources.card')}</div>
                <div className="setup-row__desc">{t('sonnClients.sources.cardDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ minWidth: 260 }}>
                  <select
                    value={source.input ?? ''}
                    onChange={(event) => update(index, { input: event.target.value || undefined })}
                  >
                    <option value="">{t('sonnClients.sources.defaultCard')}</option>
                    {inputs.map((card) => (
                      <option key={card.id} value={card.id}>
                        {cardLabel(card)}
                      </option>
                    ))}
                    {source.input && !inputs.some((card) => card.id === source.input) ? (
                      <option value={source.input}>
                        {t('sonnClients.players.missingCard', { id: source.input })}
                      </option>
                    ) : null}
                  </select>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.sources.threshold')}</div>
                <div className="setup-row__desc">{t('sonnClients.sources.thresholdDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ width: 140 }}>
                  <input
                    type="number"
                    min={-120}
                    max={0}
                    value={source.thresholdDb ?? ''}
                    placeholder="-45"
                    onChange={(event) => update(index, { thresholdDb: numberOrUndefined(event.target.value) })}
                  />
                  <span className="setup-input__suffix">dB</span>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.sources.hold')}</div>
                <div className="setup-row__desc">{t('sonnClients.sources.holdDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ width: 140 }}>
                  <input
                    type="number"
                    min={0}
                    max={60000}
                    value={source.holdMs ?? ''}
                    placeholder="2000"
                    onChange={(event) => update(index, { holdMs: numberOrUndefined(event.target.value) })}
                  />
                  <span className="setup-input__suffix">ms</span>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.sources.controlHook')}</div>
                <div className="setup-row__desc">{t('sonnClients.sources.controlHookDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ minWidth: 260 }}>
                  <input
                    type="text"
                    value={source.controlHook ?? ''}
                    placeholder="/usr/local/bin/ml-cmd"
                    onChange={(event) => update(index, { controlHook: event.target.value || undefined })}
                  />
                </div>
              </div>
            </div>
          </div>

          <p className="setup-note">{t('sonnClients.sources.linkNote', { id: source.clientId })}</p>
        </div>
      ))}
    </div>
  );
}

function RemoteSection({
  device,
  draft,
  zones,
  components,
  onChange,
  onPair,
}: {
  device: SonnDeviceView;
  draft: Draft;
  zones: ZoneOption[];
  components: SonnClientsResponse['components'];
  onChange: (change: Partial<Draft>) => void;
  onPair: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const bluetoothd = 'beoremote-bluetoothd';
  const installed = device.status?.components?.find((entry) => entry.name === bluetoothd);
  const wanted = draft.requiredComponents.includes(bluetoothd);
  const available = components.some((entry) => entry.name === bluetoothd);

  const setRemote = (change: Partial<SonnBeoremoteConfig>): void => {
    onChange({ beoremote: { ...draft.beoremote, ...change } });
  };

  return (
    <div className="sonn-group">
      <header className="sonn-group__head">
        <div>
          <h3>{t('sonnClients.remote.title')}</h3>
          <p className="setup-section__desc">{t('sonnClients.remote.desc')}</p>
        </div>
        <button
          type="button"
          className="setup-btn"
          disabled={!device.online || installed?.state !== 'running'}
          onClick={onPair}
        >
          {t('sonnClients.remote.pair')}
        </button>
      </header>

      <div className="setup-rows">
        <div className="setup-row">
          <div className="setup-row__info">
            <div className="setup-row__label">{t('sonnClients.remote.software')}</div>
            <div className="setup-row__desc">
              {available
                ? t('sonnClients.remote.softwareDesc', {
                    state: t(`sonnClients.components.${installed?.state ?? 'absent'}`, installed?.state ?? 'absent'),
                  })
                : t('sonnClients.remote.softwareUnavailable')}
            </div>
          </div>
          <div className="setup-row__control">
            <button
              type="button"
              className={`setup-toggle${wanted ? ' is-on' : ''}`}
              aria-pressed={wanted}
              disabled={!available}
              onClick={() =>
                onChange({
                  requiredComponents: wanted
                    ? draft.requiredComponents.filter((name) => name !== bluetoothd)
                    : [...draft.requiredComponents, bluetoothd],
                })
              }
            >
              <span />
            </button>
          </div>
        </div>

        <div className="setup-row">
          <div className="setup-row__info">
            <div className="setup-row__label">{t('sonnClients.remote.enabled')}</div>
            <div className="setup-row__desc">{t('sonnClients.remote.enabledDesc')}</div>
          </div>
          <div className="setup-row__control">
            <button
              type="button"
              className={`setup-toggle${draft.beoremote.enabled ? ' is-on' : ''}`}
              aria-pressed={!!draft.beoremote.enabled}
              onClick={() => setRemote({ enabled: !draft.beoremote.enabled })}
            >
              <span />
            </button>
          </div>
        </div>

        {draft.beoremote.enabled ? (
          <>
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.remote.zone')}</div>
                <div className="setup-row__desc">{t('sonnClients.remote.zoneDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ minWidth: 220 }}>
                  <select
                    value={draft.beoremote.zoneId ?? ''}
                    onChange={(event) =>
                      setRemote({ zoneId: numberOrUndefined(event.target.value) })
                    }
                  >
                    <option value="">{t('sonnClients.remote.zonePlaceholder')}</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name || `#${zone.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('sonnClients.remote.volumeStep')}</div>
                <div className="setup-row__desc">{t('sonnClients.remote.volumeStepDesc')}</div>
              </div>
              <div className="setup-row__control">
                <div className="setup-input" style={{ width: 120 }}>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={draft.beoremote.volumeStep ?? ''}
                    placeholder="4"
                    onChange={(event) => setRemote({ volumeStep: numberOrUndefined(event.target.value) })}
                  />
                </div>
              </div>
            </div>

            {draft.players.length > 1 ? (
              <div className="setup-row">
                <div className="setup-row__info">
                  <div className="setup-row__label">{t('sonnClients.remote.volumePlayer')}</div>
                  <div className="setup-row__desc">{t('sonnClients.remote.volumePlayerDesc')}</div>
                </div>
                <div className="setup-row__control">
                  <div className="setup-input" style={{ minWidth: 220 }}>
                    <select
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
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
