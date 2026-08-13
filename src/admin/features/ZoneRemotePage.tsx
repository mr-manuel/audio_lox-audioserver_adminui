import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  deviceLabel,
  devicePlayingRoom,
  listSonnClients,
  sendSonnClientCommand,
  type SonnDeviceView,
} from '../services/sonnClientsApi';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

/**
 * How often the speaker's own report is read again while this page is open. Pairing takes tens of
 * seconds and the device reports its progress; anything slower and the screen looks dead.
 */
const REFRESH_MS = 3000;

/** The models that have a page of their own. */
export type RemoteModel = 'one' | 'essence';

type ZoneRemotePageProps = {
  /** Which model this page is about. Only remotes of this model are listed. */
  model: RemoteModel;
  /** The Sendspin client this room plays through, if it has one. See {@link devicePlayingRoom}. */
  outputClientId?: string;
  config: ZoneBeoremoteConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBeoremoteConfig | null) => void;
  /** What only this model can be asked — menus and buttons for a One, nothing for an Essence. */
  children?: React.ReactNode;
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
 * What every B&O remote page in a room has in common: the switch, which speaker's radio it
 * uses, and pairing.
 *
 * Each model has its own page because they are not variants of one remote — a Beoremote One
 * has a display we fill with menus and eight keys a room can assign, an Essence has five fixed
 * buttons and neither. What they share is the room: one speaker's radio, one switch, and a
 * pairing button. That is here, once, and each page adds only its own settings.
 *
 * The switch is deliberately shared. Underneath it is one bridge per room, listening to every
 * B&O remote paired to that speaker, so a per-model switch would be a setting that quietly did
 * nothing. The copy says as much rather than showing two switches that write one value.
 */
export default function ZoneRemotePage({
  model,
  outputClientId,
  config,
  saving,
  onChange,
  children,
}: ZoneRemotePageProps): JSX.Element {
  const { t } = useTranslation();
  /**
   * Whether this room listens to this model.
   *
   * Two answers make it: the room uses B&O remotes at all, and it has not switched this model off.
   * A room that says nothing about models listens to all of them, which is what every room
   * configured before this did.
   */
  const listensTo = (which: RemoteModel): boolean =>
    config?.enabled === true && (config.models?.[which] ?? true);
  const enabled = listensTo(model);
  const [devices, setDevices] = React.useState<SonnDeviceView[]>([]);

  // Only when the room actually wants a remote: a list of speakers is not worth a request on every
  // zone screen, and this one is behind a click already.
  //
  // Kept up to date while the page is open, because everything below it happens on the speaker and
  // takes seconds: a pairing window runs for up to ninety of them, and a remote appears in the list
  // when it answers. A page that only read once showed nothing happening, and someone watching
  // nothing happen presses the button again — which is exactly what must not happen here.
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const read = (): void => {
      void listSonnClients()
        .then((response) => {
          if (!cancelled) setDevices(response.devices);
        })
        .catch(() => {
          // A speaker list that will not load is not worth an error here: the picker falls back to
          // whatever this zone already names, which is the setting that matters.
        });
    };
    read();
    const timer = window.setInterval(read, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  // Named, or else the box that plays this room — the rule the server follows when a room names
  // none, so what this screen offers is what will actually happen.
  const follows = devicePlayingRoom(devices, outputClientId);
  // The box whose radio this room actually uses, which is where pairing has to happen.
  const radio = config?.deviceId
    ? devices.find((entry) => entry.deviceId === config.deviceId)
    : follows;
  // A client too old to say which model it found only ever paired Beoremote Ones.
  const paired = (radio?.status?.beoremote?.devices ?? []).filter(
    (remote) => (remote.kind ?? 'one') === model,
  );
  // What the speaker says about pairing right now. It reports for whichever model asked, so a
  // window opened here and one opened on the other model's page look the same — which they are:
  // there is one radio, and it is busy.
  const pairing = radio?.status?.pairing;
  const windowOpen = pairing?.state === 'scanning' || pairing?.state === 'pairing';
  // Only worth showing when it went wrong: a success tells its own story by appearing in the list.
  const pairingNote =
    pairing?.state === 'failed' || pairing?.state === 'timeout' ? pairing.message : null;
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

  /**
   * Switch this model on or off for this room.
   *
   * Written as both models, never as one: an absent model means "yes", so leaving the other one out
   * would switch it back on the moment this one is switched off. And when neither is left, the
   * whole block goes rather than leaving a disabled remnant carrying key bindings for a remote
   * nobody is using.
   */
  function toggle(next: boolean): void {
    const models = { one: listensTo('one'), essence: listensTo('essence'), [model]: next };
    if (!models.one && !models.essence) {
      onChange(null);
      return;
    }
    onChange({ ...(config ?? {}), enabled: true, models });
  }

  return (
    <div className="zset">
      {/* The room's switch, on whichever model's page you happen to be. */}
      <div className="zset-group">
        <div className="zset-row">
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <div className="zset-row__text">
            <span className="zset-row__title">
              {t('zones.beoremote.useModel', { model: t(`zones.beoremote.models.${model}`) })}
            </span>
            <span className="zset-row__desc">{t('zones.beoremote.copy')}</span>
          </div>
          <button
            type="button"
            className={`zones-hub__toggle${enabled ? ' is-on' : ''}`}
            aria-label={t('zones.beoremote.useModel', {
              model: t(`zones.beoremote.models.${model}`),
            })}
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
                  onChange({
                    ...(config ?? {}),
                    enabled: true,
                    deviceId: event.target.value ? event.target.value : undefined,
                  })
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

          {/* Pairing, in the room the remote is used in. Which box's radio serves it is worked
              out above and is nobody's problem. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.beoremote.groupPairing')}</p>
            {paired.length === 0 ? (
              <p className="zset-group__empty">{t('zones.beoremote.nonePaired')}</p>
            ) : (
              paired.map((remote) => (
                <div className="zset-row" key={remote.address}>
                  <div className="zset-row__text">
                    {/* The model, not the advertised name: a BEORC1234 tells nobody which of
                        the two remotes on the table it is. */}
                    <span className="zset-row__title">{t(`zones.beoremote.models.${model}`)}</span>
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
                {/* The Essence says how it does it; the One's copy stays general because
                    nobody has held one here to check. */}
                <span className="zset-row__desc">
                  {t(model === 'essence' ? 'zones.beoremote.pairCopyEssence' : 'zones.beoremote.pairCopy')}
                </span>
              </div>
              {/* Dead while a window is open. The speaker refuses a second one anyway -- it would
                  forget the bond the first has just made -- so offering the button would only
                  invite the press that made this look broken. */}
              <button
                type="button"
                className="setup-btn"
                disabled={saving || !radio || busy === 'pair' || windowOpen}
                onClick={() => void pair()}
              >
                {windowOpen && pairing?.state === 'scanning'
                  ? t('zones.beoremote.pairLooking')
                  : windowOpen || busy === 'pair'
                    ? t('zones.beoremote.pairing')
                    : t('zones.beoremote.pair')}
              </button>
            </div>
            {pairingNote ? <p className="zset-group__empty">{pairingNote}</p> : null}
            {error ? <p className="linein-modal__error">{error}</p> : null}
          </div>

          {children}
        </>
      )}
    </div>
  );
}
