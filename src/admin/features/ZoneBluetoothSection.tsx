import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  listSonnClients,
  sendSonnClientCommand,
  type SonnDeviceView,
} from '../services/sonnClientsApi';
import type { ZoneBluetoothConfig } from '@/domain/config/types';

type ZoneBluetoothSectionProps = {
  zoneId: number;
  zoneName: string;
  config: ZoneBluetoothConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBluetoothConfig | null) => void;
};

/** What a device reports about its radio, as the client sends it. */
type BluetoothStatus = {
  discoverable?: boolean;
  name?: string;
  devices?: Array<{ address: string; name: string; connected?: boolean; streaming?: boolean }>;
  now_playing?: { title?: string; artist?: string; album?: string; status?: string } | null;
  stream?: { frames?: number } | null;
  last_error?: string | null;
};

function BluetoothGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7l10 10-5 4V3l5 4L7 17" />
    </svg>
  );
}

/**
 * Bluetooth audio for one zone.
 *
 * A receiver, like AirPlay and DLNA: something plays *into* the room from a phone someone is
 * holding. It sits with those two rather than with the remote, and it opens rather than toggles
 * because pairing and visibility need more than a switch.
 *
 * The radio belongs to a Sonn Client, so which device carries this room's Bluetooth is chosen here,
 * beside the output.
 *
 * Visibility is a moment, not a setting: a speaker that is permanently discoverable is one every
 * passer-by can see, so pairing is a button that opens a window and closes it again. Everything that
 * follows — which phones are known, what is connected, what is playing — is read back from the
 * device rather than remembered here.
 */
export default function ZoneBluetoothSection({
  zoneId,
  zoneName,
  config,
  saving,
  onChange,
}: ZoneBluetoothSectionProps): JSX.Element {
  const { t } = useTranslation();
  const enabled = config?.enabled === true;
  const [devices, setDevices] = React.useState<SonnDeviceView[]>([]);
  const [pairing, setPairing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Only when the room actually wants Bluetooth, and then often enough that pairing a phone shows
  // up while someone is standing there doing it.
  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () => {
      void listSonnClients()
        .then((response) => {
          if (!cancelled) setDevices(response.devices);
        })
        .catch(() => {
          // A list that will not load is not worth an error here: the picker falls back to whatever
          // this zone already names, which is the setting that matters.
        });
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  const update = (change: Partial<ZoneBluetoothConfig>): void => {
    onChange({ enabled: true, ...(config ?? {}), ...change });
  };

  const device = devices.find((entry) => entry.deviceId === config?.deviceId);
  const status = (device?.status as { bluetooth?: BluetoothStatus } | undefined)?.bluetooth;
  const phones = status?.devices ?? [];
  const playing = status?.now_playing;

  const openWindow = async (): Promise<void> => {
    if (!config?.deviceId) return;
    setPairing(true);
    setError(null);
    try {
      await sendSonnClientCommand(config.deviceId, 'bluetooth_discoverable');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      // The window itself lives on the device; this only says the ask went out.
      window.setTimeout(() => setPairing(false), 2000);
    }
  };

  const forget = async (address: string): Promise<void> => {
    if (!config?.deviceId) return;
    try {
      await sendSonnClientCommand(config.deviceId, 'bluetooth_forget', [address]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    /* Same vocabulary as the rest of the zone dialog: a group per question, a row per answer. The
       markup here used to reach for `zones-hub__row` classes that were never written, which is why
       the title and its explanation ran together and the switch fell through to its own line. */
    <div className="zset">
      <div className="zset-group">
        <div className="zset-row">
          <span className="zset-row__icon" aria-hidden="true">
            <BluetoothGlyph />
          </span>
          <div className="zset-row__text">
            <span className="zset-row__title">{t('zones.bluetooth.useTitle')}</span>
            <span className="zset-row__desc">{t('zones.bluetooth.useCopy')}</span>
          </div>
          <button
            type="button"
            className={`zones-hub__toggle${enabled ? ' is-on' : ''}`}
            aria-label={t('zones.bluetooth.useTitle')}
            aria-pressed={enabled}
            disabled={saving}
            onClick={() => (enabled ? onChange(null) : onChange({ enabled: true }))}
          />
        </div>
      </div>

      {enabled && (
        <>
          {/* Which radio. Pairing happens on that device; this is where the room claims it.
              One row, so no label — and no row for the name a phone sees, because that is the
              room's name and reading it back here told nobody anything. */}
          <div className="zset-group">
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.bluetooth.deviceTitle')}</span>
                <span className="zset-row__desc">{t('zones.bluetooth.deviceCopy')}</span>
              </div>
              <select
                className="zones-hub__select"
                value={config?.deviceId ?? ''}
                disabled={saving}
                onChange={(event) =>
                  update({ deviceId: event.target.value ? event.target.value : undefined })
                }
              >
                <option value="">{t('zones.bluetooth.devicePick')}</option>
                {devices.map((entry) => (
                  <option key={entry.deviceId} value={entry.deviceId}>
                    {entry.config?.name?.trim() ||
                      entry.registration?.hostname?.trim() ||
                      entry.config?.hostname?.trim() ||
                      entry.deviceId}
                  </option>
                ))}
                {config?.deviceId && !devices.some((entry) => entry.deviceId === config.deviceId) ? (
                  <option value={config.deviceId}>
                    {t('zones.bluetooth.deviceMissing', { id: config.deviceId })}
                  </option>
                ) : null}
              </select>
            </div>
          </div>

          {/* Pairing: a window that opens and closes again. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.bluetooth.groupPairing')}</p>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.bluetooth.pairTitle')}</span>
                <span className="zset-row__desc">
                  {status?.discoverable
                    ? t('zones.bluetooth.pairOpen', { name: status.name ?? zoneName })
                    : t('zones.bluetooth.pairCopy')}
                </span>
              </div>
              <button
                type="button"
                className="zones-modal__btn"
                disabled={saving || pairing || !config?.deviceId}
                onClick={() => void openWindow()}
              >
                {pairing ? t('zones.bluetooth.pairing') : t('zones.bluetooth.pair')}
              </button>
            </div>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.bluetooth.windowTitle')}</span>
                <span className="zset-row__desc">{t('zones.bluetooth.windowCopy')}</span>
              </div>
              <span className="zones-hub__num">
                <input
                  type="number"
                  inputMode="numeric"
                  className="zones-hub__input"
                  value={config?.discoverableSeconds ?? ''}
                  placeholder="120"
                  disabled={saving}
                  onChange={(event) =>
                    update({
                      discoverableSeconds: event.target.value
                        ? Number(event.target.value)
                        : undefined,
                    })
                  }
                />
                <span className="zones-hub__num-suffix">s</span>
              </span>
            </div>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.bluetooth.pinTitle')}</span>
                <span className="zset-row__desc">{t('zones.bluetooth.pinCopy')}</span>
              </div>
              <input
                className="zones-hub__input"
                value={config?.pin ?? ''}
                placeholder={t('zones.bluetooth.pinNone')}
                disabled={saving}
                onChange={(event) => update({ pin: event.target.value || undefined })}
              />
            </div>
            <div className="zset-row">
              <div className="zset-row__text">
                <span className="zset-row__title">{t('zones.bluetooth.controlTitle')}</span>
                <span className="zset-row__desc">{t('zones.bluetooth.controlCopy')}</span>
              </div>
              <button
                type="button"
                className={`zones-hub__toggle${config?.control !== false ? ' is-on' : ''}`}
                aria-label={t('zones.bluetooth.controlTitle')}
                aria-pressed={config?.control !== false}
                disabled={saving}
                onClick={() => update({ control: config?.control === false })}
              />
            </div>
          </div>

          {/* What the device reports back: which phones it knows, and what is playing. */}
          <div className="zset-group">
            <p className="zset-group__head">{t('zones.bluetooth.groupPhones')}</p>
            {phones.length === 0 ? (
              <p className="zset-group__empty">{t('zones.bluetooth.noPhones')}</p>
            ) : (
              phones.map((phone) => (
                <div className="zset-row" key={phone.address}>
                  <div className="zset-row__text">
                    <span className="zset-row__title">{phone.name}</span>
                    <span className="zset-row__desc">{phone.address}</span>
                  </div>
                  <span
                    className={`zones-card__status-pill${
                      phone.streaming || phone.connected ? ' is-ok' : ' is-muted'
                    }`}
                  >
                    <span className="zones-card__status-dot" />
                    {phone.streaming
                      ? t('zones.bluetooth.phoneStreaming')
                      : phone.connected
                        ? t('zones.bluetooth.phoneConnected')
                        : t('zones.bluetooth.phonePaired')}
                  </span>
                  <button
                    type="button"
                    className="zones-modal__btn"
                    disabled={saving}
                    onClick={() => void forget(phone.address)}
                  >
                    {t('zones.bluetooth.forget')}
                  </button>
                </div>
              ))
            )}
            {/* Only while something is actually coming in: a title left over from an hour ago
                reads as a claim that the room is playing. */}
            {playing?.title && phones.some((phone) => phone.streaming) ? (
              <div className="zset-row">
                <span className="zset-row__icon" aria-hidden="true">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                </span>
                <div className="zset-row__text">
                  <span className="zset-row__title">{playing.title}</span>
                  <span className="zset-row__desc">
                    {[playing.artist, playing.album === playing.title ? '' : playing.album]
                      .filter(Boolean)
                      .join(' — ')}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          {(error || status?.last_error) && (
            <p className="linein-modal__error">{error ?? status?.last_error}</p>
          )}
        </>
      )}
    </div>
  );
}
