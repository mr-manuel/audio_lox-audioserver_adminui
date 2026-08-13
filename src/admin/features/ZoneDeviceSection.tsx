import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  deviceLabel,
  devicePlayingRoom,
  listSonnClients,
  saveSonnClient,
  type SonnDeviceView,
  type SonnPlayerConfig,
} from '../services/sonnClientsApi';

type ZoneDeviceSectionProps = {
  zoneId: number;
  /** The Sendspin client this room plays through, if it has one. */
  outputClientId?: string;
};

/**
 * The Sonn Client that plays this room, settled from the room.
 *
 * Which sound card a speaker is wired to and where it turns the volume down are questions about the
 * hardware — but they are asked while setting up a room, and sending someone to another screen for
 * two rows is how a simple job comes to feel like an installation. So the ones that come up in
 * practice are answered here, and the device's own page keeps everything that is genuinely about the
 * box: its name, its updates, what it reports.
 *
 * Delay is deliberately not here. The room's output already has one, and it is the one that counts:
 * the server writes it to the client as `set_static_delay`. The number on the speaker is what the
 * device itself persisted, which the server then writes over — so a second box here would look like
 * a setting and behave like a suggestion.
 *
 * It appears only when a Sonn Client actually plays this room. A room on a Sonos or an AirPlay
 * speaker has none, and an empty group explaining that would be noise.
 */
export default function ZoneDeviceSection({
  zoneId,
  outputClientId,
}: ZoneDeviceSectionProps): JSX.Element | null {
  const { t } = useTranslation();
  const [devices, setDevices] = React.useState<SonnDeviceView[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void listSonnClients()
      .then((response) => {
        if (!cancelled) setDevices(response.devices);
      })
      .catch(() => {
        // Nothing to show is the right answer when the list will not load: this section is a
        // convenience, and the device's own screen is where a real problem gets reported.
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId]);

  const device = devicePlayingRoom(devices, outputClientId);
  const player = device?.config?.players?.find((entry) => entry.clientId === outputClientId);
  if (!device || !player) {
    return null;
  }

  const cards = device.registration?.outputs ?? [];
  const volumeControl = player.volumeControl ?? 'auto';

  const update = async (change: Partial<SonnPlayerConfig>): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      // The whole list goes back: this screen edits one speaker, and a device may have more.
      const players = (device.config?.players ?? []).map((entry) =>
        entry.clientId === player.clientId ? { ...entry, ...change } : entry,
      );
      const saved = await saveSonnClient(device.deviceId, { players });
      setDevices((current) =>
        current.map((entry) => (entry.deviceId === device.deviceId ? saved : entry)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zset-group">
      <p className="zset-group__head">{t('zones.device.group', { name: deviceLabel(device) })}</p>

      <div className="zset-row">
        <div className="zset-row__text">
          <span className="zset-row__title">{t('zones.device.cardTitle')}</span>
          <span className="zset-row__desc">{t('zones.device.cardCopy')}</span>
        </div>
        <select
          className="zones-hub__select"
          value={player.output ?? ''}
          disabled={saving || cards.length === 0}
          onChange={(event) => void update({ output: event.target.value || undefined })}
        >
          <option value="">{t('zones.device.cardDefault')}</option>
          {cards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name || card.id}
            </option>
          ))}
          {/* A card that is configured but not reported right now keeps its place, so opening this
              while the box is rebooting does not quietly move the room to another output. */}
          {player.output && !cards.some((card) => card.id === player.output) ? (
            <option value={player.output}>
              {t('zones.device.cardMissing', { id: player.output })}
            </option>
          ) : null}
        </select>
      </div>

      <div className="zset-row">
        <div className="zset-row__text">
          <span className="zset-row__title">{t('zones.device.volumeTitle')}</span>
          <span className="zset-row__desc">{t('zones.device.volumeCopy')}</span>
        </div>
        <select
          className="zones-hub__select"
          value={volumeControl}
          disabled={saving}
          onChange={(event) =>
            void update({ volumeControl: event.target.value as SonnPlayerConfig['volumeControl'] })
          }
        >
          <option value="auto">{t('zones.device.volumeAuto')}</option>
          <option value="alsa">{t('zones.device.volumeCard')}</option>
          <option value="software">{t('zones.device.volumeSoftware')}</option>
          <option value="hook">{t('zones.device.volumeHook')}</option>
        </select>
      </div>

      <p className="zset-group__empty">{t('zones.device.elsewhere')}</p>
      {error ? <p className="linein-modal__error">{error}</p> : null}
    </div>
  );
}
