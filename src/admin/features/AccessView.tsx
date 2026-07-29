import React from 'react';
import { useTranslation } from 'react-i18next';
// Shares the admin form language (inputs, buttons, notes) with Setup; the card
// grid is this view's own.
import './SetupView.css';
import './AccessView.css';
import { getConfig } from '../services/setupApi';
import { updateContentConfig } from '../services/contentApi';
import {
  getSubsonicStatus,
  updateSubsonicConfig,
  SubsonicConfigError,
  type SubsonicStatus,
} from '../services/subsonicApi';
import {
  getMqttStatus,
  updateMqttConfig,
  MqttConfigError,
  brokerDraftFrom,
  brokerDraftDirty,
  brokerPayload,
  type MqttStatus,
  type MqttBrokerDraft,
} from '../services/mqttApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import InlineState from '../components/InlineState';
import { copyText } from '../utils/clipboard';
import type { RootConfig } from '../types/config';

type ConfigResponse = { config: RootConfig };

/** Every way this server is reachable from outside. Adding one means adding an entry
 *  to `ORDER` plus its `access.services.<id>` copy — and, only if it has settings of
 *  its own, a block in `renderExtras`. */
type ServiceId = 'loxone' | 'dlna' | 'subsonic' | 'webdav' | 'mqtt';

// Loxone leads: this server started life as a pure Loxone Audioserver, and that
// implementation is still its most complete integration. MQTT sits last because it
// is the odd one out — it serves no content, it pushes state outward.
const ORDER: readonly ServiceId[] = ['loxone', 'dlna', 'subsonic', 'webdav', 'mqtt'];

function PhoneGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
      <path d="M9.5 7.5h5M9.5 10.5h5M9.5 13.5h3" opacity="0.55" />
    </svg>
  );
}

/** Brand artwork where we ship it, a purpose-drawn glyph otherwise. */
function ServiceMark({ id }: { id: ServiceId }): JSX.Element {
  const asset = id === 'dlna' ? 'providers/dlna.svg' : id === 'loxone' ? 'providers/loxone.png' : '';
  if (asset) return <img src={`${import.meta.env.BASE_URL || '/'}${asset}`} alt="" />;
  return <PhoneGlyph />;
}

/**
 * Access — how this server is reached from outside. The inverse of playback: one
 * card per interface, each showing its state and its own settings inline. Most
 * serve content (the library, radio, streaming services); MQTT is the exception,
 * publishing zone state outward for home automation to consume.
 * Deliberately data-driven so a new interface slots in without touching the
 * layout, and a content-only deployment lives entirely here.
 */
export default function AccessView(): JSX.Element {
  const { t } = useTranslation();
  const { push: pushAlert } = useGlobalAlert();

  const [data, setData] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<ServiceId | null>(null);
  const [subsonic, setSubsonic] = React.useState<SubsonicStatus | null>(null);
  const [mqtt, setMqtt] = React.useState<MqttStatus | null>(null);
  const [brokerDraft, setBrokerDraft] = React.useState<MqttBrokerDraft>(brokerDraftFrom(null));
  const [urlCopied, setUrlCopied] = React.useState(false);
  const [davCopied, setDavCopied] = React.useState(false);

  const refreshConfig = React.useCallback(async (): Promise<void> => {
    setError(null);
    try {
      setData((await getConfig()) as ConfigResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSubsonic = React.useCallback(async (): Promise<void> => {
    try {
      setSubsonic(await getSubsonicStatus());
    } catch {
      setSubsonic(null);
    }
  }, []);

  const refreshMqtt = React.useCallback(async (): Promise<void> => {
    try {
      const status = await getMqttStatus();
      setMqtt(status);
      // Only on load: re-seeding on every refresh would discard what someone is typing.
      setBrokerDraft((current) =>
        brokerDraftDirty(current, null) ? current : brokerDraftFrom(status),
      );
    } catch {
      setMqtt(null);
    }
  }, []);

  React.useEffect(() => {
    void refreshConfig();
    void refreshSubsonic();
    void refreshMqtt();
  }, [refreshConfig, refreshSubsonic, refreshMqtt]);

  const cfg = data?.config ?? {};
  const audioserver = cfg.system?.audioserver;
  const loxoneEnabled = audioserver?.loxoneEnabled === true;
  const mediaServerEnabled = Boolean(cfg.content?.mediaServer?.enabled);
  const subsonicEnabled = subsonic?.enabled ?? false;

  const webdavEnabled = Boolean(cfg.content?.webdav?.enabled);

  const mqttEnabled = mqtt?.enabled ?? false;

  const isOn: Record<ServiceId, boolean> = {
    loxone: loxoneEnabled,
    dlna: mediaServerEnabled,
    subsonic: subsonicEnabled,
    webdav: webdavEnabled,
    mqtt: mqttEnabled,
  };
  const enabledCount = ORDER.filter((id) => isOn[id]).length;
  const brokerDirty = brokerDraftDirty(brokerDraft, mqtt);

  /** Only the state the toggle can't express: listening, but not paired yet. The
   *  plain on/off is already visible in the control itself. */
  function pendingLabel(id: ServiceId): string | null {
    if (id === 'loxone' && isOn[id] && audioserver?.paired === false) {
      return t('access.services.loxone.waiting');
    }
    return null;
  }

  function errorText(err: unknown): string {
    if (err instanceof MqttConfigError) {
      // The one refusal a user causes by switching on before filling the form in.
      return err.code === 'host-required' ? t('access.services.mqtt.hostRequired') : err.message;
    }
    if (err instanceof SubsonicConfigError) {
      return err.code === 'no-usable-credentials'
        ? t('access.servers.subsonicNoCredentials')
        : err.message;
    }
    return err instanceof Error ? err.message : t('access.servers.failedMessage');
  }

  async function toggleService(id: ServiceId, next: boolean): Promise<void> {
    if (saving) return;
    setSaving(id);
    try {
      if (id === 'dlna') {
        await updateContentConfig({ mediaServer: { enabled: next } });
        await refreshConfig();
      } else if (id === 'subsonic') {
        setSubsonic(await updateSubsonicConfig({ enabled: next }));
      } else if (id === 'webdav') {
        await updateContentConfig({ webdav: { enabled: next } });
        await refreshConfig();
      } else if (id === 'mqtt') {
        setMqtt(await updateMqttConfig({ enabled: next }));
      }
    } catch (err) {
      pushAlert({ tone: 'error', title: t('access.failedTitle'), message: errorText(err) });
    } finally {
      setSaving(null);
    }
  }

  /** Saves the broker fields. Reported by the server's fresh status, so the connection
   *  result is visible immediately rather than after a manual refresh. */
  async function saveBroker(): Promise<void> {
    if (saving) return;
    setSaving('mqtt');
    try {
      const status = await updateMqttConfig(brokerPayload(brokerDraft));
      setMqtt(status);
      setBrokerDraft(brokerDraftFrom(status));
    } catch (err) {
      pushAlert({ tone: 'error', title: t('access.failedTitle'), message: errorText(err) });
    } finally {
      setSaving(null);
    }
  }

  async function setProgress(next: boolean): Promise<void> {
    if (saving) return;
    setSaving('mqtt');
    try {
      setMqtt(await updateMqttConfig({ publishProgress: next }));
    } catch (err) {
      pushAlert({ tone: 'error', title: t('access.failedTitle'), message: errorText(err) });
    } finally {
      setSaving(null);
    }
  }

  async function copyDavUrl(url: string): Promise<void> {
    if (!(await copyText(url))) return;
    setDavCopied(true);
    window.setTimeout(() => setDavCopied(false), 2000);
  }

  async function copyClientUrl(): Promise<void> {
    if (!subsonic || !(await copyText(subsonic.url))) return;
    setUrlCopied(true);
    window.setTimeout(() => setUrlCopied(false), 2000);
  }

  /** Settings that belong to one interface, shown in its card while it is serving.
   *  Interfaces with nothing to configure simply return null. */
  function renderExtras(id: ServiceId): JSX.Element | null {
    if (id === 'subsonic' && subsonicEnabled && subsonic) {
      return (
        <div className="access-url" title={subsonic.url}>
          <code className="access-url__text">{subsonic.url}</code>
          <button
            type="button"
            className={`access-url__copy${urlCopied ? ' is-done' : ''}`}
            onClick={() => void copyClientUrl()}
          >
            {urlCopied ? t('access.servers.copied') : t('access.servers.copy')}
          </button>
        </div>
      );
    }

    if (id === 'webdav' && webdavEnabled) {
      // Shown so the address can be pasted straight into Finder's "Connect to
      // Server" or mapped as a drive in Explorer.
      const davUrl = `${window.location.protocol}//${window.location.host}/dav/`;
      return (
        <div className="access-url" title={davUrl}>
          <code className="access-url__text">{davUrl}</code>
          <button
            type="button"
            className={`access-url__copy${davCopied ? ' is-done' : ''}`}
            onClick={() => void copyDavUrl(davUrl)}
          >
            {davCopied ? t('access.servers.copied') : t('access.servers.copy')}
          </button>
        </div>
      );
    }

    // Shown whether or not it is switched on: the broker has to be filled in *before*
    // enabling, since enabling without one is refused.
    if (id === 'mqtt' && mqtt) {
      return (
        <div className="access-mqtt">
          {mqttEnabled ? (
            /* The connection is worth stating plainly: everything else in this view
               either works or is visibly absent, while a broker address can save
               successfully and never connect. */
            <div className={`access-mqtt__state${mqtt.connected ? ' is-ok' : ' is-bad'}`}>
              {mqtt.connected
                ? t('access.services.mqtt.connected', { count: mqtt.published })
                : (mqtt.lastError ?? t('access.services.mqtt.disconnected'))}
            </div>
          ) : null}

          <label className="access-field">
            <span className="access-field__label">{t('access.services.mqtt.brokerLabel')}</span>
            <span className="access-field__hint">{t('access.services.mqtt.brokerDesc')}</span>
            <span className="access-field__pair">
              <input
                className="access-field__input"
                type="text"
                value={brokerDraft.host}
                placeholder="192.168.1.10"
                onChange={(e) => setBrokerDraft({ ...brokerDraft, host: e.target.value })}
              />
              <input
                className="access-field__input access-field__input--port"
                type="number"
                value={brokerDraft.port}
                placeholder="1883"
                aria-label={t('access.services.mqtt.portLabel')}
                onChange={(e) => setBrokerDraft({ ...brokerDraft, port: e.target.value })}
              />
            </span>
          </label>

          <label className="access-field">
            <span className="access-field__label">{t('access.services.mqtt.authLabel')}</span>
            <span className="access-field__hint">{t('access.services.mqtt.authDesc')}</span>
            <span className="access-field__pair">
              <input
                className="access-field__input"
                type="text"
                value={brokerDraft.username}
                placeholder={t('access.services.mqtt.usernamePlaceholder')}
                onChange={(e) => setBrokerDraft({ ...brokerDraft, username: e.target.value })}
              />
              <input
                className="access-field__input"
                type="password"
                value={brokerDraft.password}
                // Says a password is stored without revealing it: the server never
                // sends it back, and an untouched field must not clear it.
                placeholder={
                  mqtt.hasPassword
                    ? t('access.services.mqtt.passwordStored')
                    : t('access.services.mqtt.passwordPlaceholder')
                }
                onChange={(e) => setBrokerDraft({ ...brokerDraft, password: e.target.value })}
              />
            </span>
          </label>

          <label className="access-field">
            <span className="access-field__label">{t('access.services.mqtt.prefixLabel')}</span>
            <span className="access-field__hint">{t('access.services.mqtt.prefixDesc')}</span>
            <input
              className="access-field__input"
              type="text"
              value={brokerDraft.topicPrefix}
              placeholder="sonn"
              onChange={(e) => setBrokerDraft({ ...brokerDraft, topicPrefix: e.target.value })}
            />
          </label>

          <button
            type="button"
            className="access-mqtt__save"
            disabled={saving !== null || !brokerDirty}
            onClick={() => void saveBroker()}
          >
            {saving === 'mqtt'
              ? t('access.services.mqtt.saving')
              : t('access.services.mqtt.save')}
          </button>

          {mqttEnabled ? (
            <>
              <p className="access-mqtt__where">
                {t('access.services.mqtt.topicDesc', { prefix: mqtt.topicPrefix })}
              </p>
              <div className="access-mqtt__option">
                <span className="access-mqtt__option-text">
                  <span className="access-field__label">
                    {t('access.services.mqtt.progressLabel')}
                  </span>
                  <span className="access-field__hint">
                    {t('access.services.mqtt.progressDesc')}
                  </span>
                </span>
                <button
                  type="button"
                  className={`setup-toggle${mqtt.publishProgress ? ' is-on' : ''}`}
                  aria-pressed={mqtt.publishProgress}
                  disabled={saving !== null}
                  onClick={() => void setProgress(!mqtt.publishProgress)}
                >
                  {mqtt.publishProgress ? t('access.on') : t('access.off')}
                </button>
              </div>
            </>
          ) : null}
        </div>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div className="setup-layout">
        <div className="setup-placeholder">
          <InlineState kind="loading" title={t('access.loading.title')} message={t('access.loading.message')} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="setup-layout">
        <div className="setup-placeholder">
          <InlineState
            kind="error"
            title={t('access.errorState.title')}
            message={error}
            action={{ label: t('access.retry'), onClick: () => void refreshConfig() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="setup-layout">
      <header className="setup-head">
        <div className="setup-head__main">
          <p className="setup-eyebrow">{t('access.eyebrow')}</p>
          <h1 className="setup-title">{t('access.title')}</h1>
          <p className="setup-subtitle">{t('access.subtitle')}</p>
        </div>
        <span className="access-count">
          {t('access.count', { on: enabledCount, total: ORDER.length })}
        </span>
      </header>

      <div className="access-grid">
        {ORDER.map((id) => {
          const on = isOn[id];
          // Loxone follows the integration switch on Players, so here it only reports.
          const readOnly = id === 'loxone';
          const extras = renderExtras(id);
          const pending = pendingLabel(id);
          // Services switched from another screen say so, since they have no toggle here.
          const hint = t(`access.services.${id}.hint`, { defaultValue: '' });
          return (
            <article key={id} className={`access-card${on ? ' is-on' : ''}`}>
              <div className="access-card__head">
                <span className="access-card__icon" aria-hidden="true">
                  <ServiceMark id={id} />
                </span>
                <h2 className="access-card__name">{t(`access.services.${id}.name`)}</h2>
                {readOnly ? (
                  <span className={`setup-badge${on ? ' setup-badge--ok' : ''}`}>
                    {on ? t('access.on') : t('access.off')}
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`setup-toggle${on ? ' is-on' : ''}`}
                    aria-label={t(`access.services.${id}.name`)}
                    aria-pressed={on}
                    disabled={saving !== null}
                    onClick={() => void toggleService(id, !on)}
                  />
                )}
              </div>

              <p className="access-card__desc">{t(`access.services.${id}.purpose`)}</p>

              {hint ? <p className="access-card__hint">{hint}</p> : null}

              {pending ? (
                <span className="access-pending">
                  <span className="access-pending__dot" aria-hidden="true" />
                  {pending}
                </span>
              ) : null}

              {extras ? <div className="access-card__extras">{extras}</div> : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
