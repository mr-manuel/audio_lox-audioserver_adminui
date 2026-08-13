import React from 'react';
import { useTranslation } from 'react-i18next';
import ZoneBeoremoteKeys from './ZoneBeoremoteKeys';
import {
  deviceLabel,
  devicePlayingRoom,
  listSonnClients,
  sendSonnClientCommand,
  type SonnDeviceView,
} from '../services/sonnClientsApi';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

/** The submenu choices a zone can pick. The remote's firmware allows exactly one. */
type SubmenuKind = 'none' | 'radio' | 'favorites';

type ZoneBeoremoteSectionProps = {
  zoneId: number;
  /** The Sendspin client this room plays through, if it has one. See {@link devicePlayingRoom}. */
  outputClientId?: string;
  config: ZoneBeoremoteConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBeoremoteConfig | null) => void;
};

function RemoteGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <circle cx="12" cy="7" r="1.4" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
    </svg>
  );
}

/**
 * Beoremote One for one zone.
 *
 * Everything a person in this room touches is here: which box's radio it uses, pairing the remote
 * itself, and what its screen lists. A phone pairs on this same page, and for someone standing with
 * the thing in their hand the two are one act — connect what is in this room to this room. Splitting
 * them by whose fact it technically is (the box's, the room's) was accurate and helped nobody.
 *
 * The remote's screen is narrow and its firmware allows a single sub-list, so the
 * only real choice here is what goes in that list. Everything else about the menu
 * (order, length, shortened names) the server decides.
 */
export default function ZoneBeoremoteSection({
  zoneId,
  outputClientId,
  config,
  saving,
  onChange,
}: ZoneBeoremoteSectionProps): JSX.Element {
  const { t } = useTranslation();
  const enabled = config?.enabled === true;
  const [devices, setDevices] = React.useState<SonnDeviceView[]>([]);

  // Only when the room actually wants a remote: a list of speakers is not worth a request on every
  // zone screen, and this one is behind a click already.
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void listSonnClients()
      .then((response) => {
        if (!cancelled) setDevices(response.devices);
      })
      .catch(() => {
        // A speaker list that will not load is not worth an error here: the picker falls back to
        // whatever this zone already names, which is the setting that matters.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // Named, or else the box that plays this room — the rule the server follows when a room names
  // none, so what this screen offers is what will actually happen.
  const follows = devicePlayingRoom(devices, outputClientId);
  // The box whose radio this room actually uses, which is where pairing has to happen.
  const radio = config?.deviceId
    ? devices.find((entry) => entry.deviceId === config.deviceId)
    : follows;
  const paired = radio?.status?.beoremote?.devices ?? [];
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const send = async (what: string, command: string, args?: string[]): Promise<void> => {
    if (!radio) return;
    setBusy(what);
    setError(null);
    try {
      await sendSonnClientCommand(radio.deviceId, command, args);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // The device takes the command on its next poll and the list follows from its next report;
      // this only says the ask went out.
      window.setTimeout(() => setBusy(null), 3000);
    }
  };
  const pair = (): Promise<void> => send('pair', 'pair_remote');
  const forget = (address: string): Promise<void> => send(address, 'forget_remote', [address]);

  const submenuKind: SubmenuKind = config?.submenuSource?.kind === 'radio'
    ? 'radio'
    : config?.submenuSource?.kind === 'favorites'
      ? 'favorites'
      : 'none';

  function update(patch: Partial<ZoneBeoremoteConfig>): void {
    onChange({ enabled, ...(config ?? {}), ...patch });
  }

  function toggle(next: boolean): void {
    // Turning it off drops the whole block rather than leaving a disabled remnant
    // carrying key bindings for a remote nobody is using.
    onChange(next ? { ...(config ?? {}), enabled: true } : null);
  }

  function changeSubmenu(kind: SubmenuKind): void {
    update({ submenuSource: kind === 'none' ? null : { kind } });
  }

  return (
    <div className="zset">
      {/* This page is about one model, so it leads with its own on/off and then the
          settings that only exist while it is on. */}
      <div className="zset-group">
        <div className="zset-row">
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <div className="zset-row__text">
            <span className="zset-row__title">{t('zones.beoremote.useTitle')}</span>
            <span className="zset-row__desc">{t('zones.beoremote.copy')}</span>
          </div>
          <button
            type="button"
            className={`zones-hub__toggle${enabled ? ' is-on' : ''}`}
            aria-label={t('zones.beoremote.useTitle')}
            aria-pressed={enabled}
            disabled={saving}
            onClick={() => toggle(!enabled)}
          />
        </div>
      </div>

      {enabled && (
        <>
          {/* Which box's radio. Nearly always the one that plays the room, and then this is a
              sentence rather than a question. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.beoremote.groupDevice')}</p>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.beoremote.deviceTitle')}</span>
                <span className="zset-row__desc">{t('zones.beoremote.deviceCopy')}</span>
              </div>
              <select
                className="zones-hub__select"
                value={config?.deviceId ?? ''}
                disabled={saving}
                onChange={(event) =>
                  update({ deviceId: event.target.value ? event.target.value : undefined })
                }
              >
                <option value="">
                  {follows
                    ? t('zones.beoremote.deviceFollows', { name: deviceLabel(follows) })
                    : t('zones.beoremote.deviceAny')}
                </option>
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {deviceLabel(device)}
                  </option>
                ))}
                {/* A device that is configured but not in the list right now keeps its place, so
                    opening this screen while a speaker is offline does not silently unassign it. */}
                {config?.deviceId && !devices.some((device) => device.deviceId === config.deviceId) ? (
                  <option value={config.deviceId}>
                    {t('zones.beoremote.deviceMissing', { id: config.deviceId })}
                  </option>
                ) : null}
              </select>
            </div>
          </div>

          {/* Pairing, in the room the remote is used in.
              A phone pairs here too, and for someone standing with the thing in their hand the two
              are the same act: connect what is in this room to this room. Which box's radio serves
              it is worked out above and is nobody's problem. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.beoremote.groupPairing')}</p>
            {paired.length === 0 ? (
              <p className="zset-group__empty">{t('zones.beoremote.nonePaired')}</p>
            ) : (
              paired.map((remote) => (
                <div className="zset-row" key={remote.address}>
                  <div className="zset-row__text">
                    <span className="zset-row__title">{remote.name || remote.address}</span>
                    <span className="zset-row__desc">
                      {remote.connected
                        ? t('zones.beoremote.pairedConnected')
                        : t('zones.beoremote.pairedAway')}
                      {' · '}
                      {remote.address}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="setup-btn"
                    disabled={saving || busy === remote.address}
                    onClick={() => void forget(remote.address)}
                  >
                    {busy === remote.address
                      ? t('zones.beoremote.forgetting')
                      : t('zones.beoremote.forget')}
                  </button>
                </div>
              ))
            )}
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.beoremote.pairTitle')}</span>
                <span className="zset-row__desc">{t('zones.beoremote.pairCopy')}</span>
              </div>
              <button
                type="button"
                className="setup-btn"
                disabled={saving || !radio || busy === 'pair'}
                onClick={() => void pair()}
              >
                {busy === 'pair' ? t('zones.beoremote.pairing') : t('zones.beoremote.pair')}
              </button>
            </div>
            {error ? <p className="linein-modal__error">{error}</p> : null}
          </div>

          {/* What the remote's own screen lists. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.beoremote.groupMenu')}</p>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.beoremote.lineInsTitle')}</span>
                <span className="zset-row__desc">{t('zones.beoremote.lineInsCopy')}</span>
              </div>
              <button
                type="button"
                className={`zones-hub__toggle${config?.includeLineIns !== false ? ' is-on' : ''}`}
                aria-label={t('zones.beoremote.lineInsTitle')}
                aria-pressed={config?.includeLineIns !== false}
                disabled={saving}
                onClick={() => update({ includeLineIns: config?.includeLineIns === false })}
              />
            </div>

            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.beoremote.submenuTitle')}</span>
                <span className="zset-row__desc">{t('zones.beoremote.submenuCopy')}</span>
              </div>
              {/* A plain select, like the state-controller row: SelectMenu is width:100%
                  and would squeeze the label column to nothing in a flex row. */}
              <select
                className="zones-hub__select"
                value={submenuKind}
                disabled={saving}
                aria-label={t('zones.beoremote.submenuTitle')}
                onChange={(event) => changeSubmenu(event.target.value as SubmenuKind)}
              >
                <option value="none">{t('zones.beoremote.submenuNone')}</option>
                <option value="radio">{t('zones.beoremote.submenuRadio')}</option>
                <option value="favorites">{t('zones.beoremote.submenuFavorites')}</option>
              </select>
            </div>
          </div>

          {/* The buttons get their own group and stay open: on a page of their own
              there is room, and hiding them behind a second disclosure was the
              thing that made this hard to use. */}
          <ZoneBeoremoteKeys
            zoneId={zoneId}
            saving={saving}
            onChange={(keys) => update({ keys })}
          />
        </>
      )}
    </div>
  );
}
