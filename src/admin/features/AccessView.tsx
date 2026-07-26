import React from 'react';
import { useTranslation } from 'react-i18next';
// Shares the admin form language (sections, rows, tiles, toggles) with Setup.
import './SetupView.css';
import { getConfig } from '../services/setupApi';
import { updateContentConfig } from '../services/contentApi';
import {
  getSubsonicStatus,
  updateSubsonicConfig,
  SubsonicConfigError,
  type SubsonicStatus,
} from '../services/subsonicApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import InlineState from '../components/InlineState';
import { copyText } from '../utils/clipboard';
import type { RootConfig } from '../types/config';

type ConfigResponse = { config: RootConfig };

function InfoGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.5" x2="12" y2="7.6" />
    </svg>
  );
}

/**
 * Access — how the server's content is reached from the network. This is the
 * inverse of playback: the outbound content interfaces (DLNA MediaServer,
 * Subsonic) plus the Loxone protocol server. It owns no zones/players; a pure
 * content-server deployment lives entirely here.
 */
export default function AccessView(): JSX.Element {
  const { t } = useTranslation();
  const { push: pushAlert } = useGlobalAlert();

  const [data, setData] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [serversSaving, setServersSaving] = React.useState<string | null>(null);
  const [subsonic, setSubsonic] = React.useState<SubsonicStatus | null>(null);
  const [subsonicDraft, setSubsonicDraft] = React.useState({ directoryLimit: '' });
  const [subsonicDirty, setSubsonicDirty] = React.useState(false);
  const [subsonicError, setSubsonicError] = React.useState<string | null>(null);
  const [urlCopied, setUrlCopied] = React.useState(false);

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

  React.useEffect(() => {
    void refreshConfig();
    void refreshSubsonic();
  }, [refreshConfig, refreshSubsonic]);

  const cfg = data?.config ?? {};
  const content = cfg.content ?? {};
  const standalone = cfg.system?.audioserver?.mode === 'standalone';
  React.useEffect(() => {
    if (!subsonicDirty && subsonic) {
      setSubsonicDraft({ directoryLimit: String(subsonic.directoryLimit) });
    }
  }, [subsonic, subsonicDirty]);

  const mediaServerEnabled = Boolean(content.mediaServer?.enabled);
  const subsonicEnabled = subsonic?.enabled ?? false;

  async function toggleMediaServer(next: boolean): Promise<void> {
    if (serversSaving) return;
    setServersSaving('mediaServer');
    try {
      await updateContentConfig({ mediaServer: { enabled: next } });
      await refreshConfig();
    } catch (err) {
      pushAlert({
        tone: 'error',
        title: t('protocols.servers.failedTitle'),
        message: err instanceof Error ? err.message : t('protocols.servers.failedMessage'),
      });
    } finally {
      setServersSaving(null);
    }
  }

  function subsonicErrorText(err: unknown): string {
    if (err instanceof SubsonicConfigError) {
      switch (err.code) {
        case 'no-usable-credentials':
          return t('protocols.servers.subsonicNoCredentials');
        case 'invalid-directory-limit':
          return t('protocols.servers.subsonicLimitRange', {
            min: err.detail.min ?? subsonic?.directoryLimitBounds.min,
            max: err.detail.max ?? subsonic?.directoryLimitBounds.max,
          });
        case 'unknown-provider':
          return t('protocols.servers.subsonicUnknownProvider', {
            providers: Array.isArray(err.detail.providers) ? err.detail.providers.join(', ') : '',
          });
        default:
          return err.message;
      }
    }
    return err instanceof Error ? err.message : t('protocols.servers.failedMessage');
  }

  async function writeSubsonic(payload: Parameters<typeof updateSubsonicConfig>[0]): Promise<boolean> {
    setServersSaving('subsonic');
    setSubsonicError(null);
    try {
      setSubsonic(await updateSubsonicConfig(payload));
      return true;
    } catch (err) {
      const text = subsonicErrorText(err);
      setSubsonicError(text);
      if (!subsonic?.enabled) {
        pushAlert({ tone: 'warn', title: t('protocols.servers.failedTitle'), message: text });
      }
      return false;
    } finally {
      setServersSaving(null);
    }
  }

  async function toggleSubsonic(next: boolean): Promise<void> {
    if (serversSaving) return;
    if (await writeSubsonic({ enabled: next })) setSubsonicDirty(false);
  }

  async function copyClientUrl(): Promise<void> {
    if (!subsonic) return;
    const ok = await copyText(subsonic.url);
    if (!ok) return;
    setUrlCopied(true);
    window.setTimeout(() => setUrlCopied(false), 2000);
  }

  async function saveSubsonicSettings(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (serversSaving || !subsonic) return;
    const limit = Number(subsonicDraft.directoryLimit);
    if (!Number.isFinite(limit) || limit === subsonic.directoryLimit) return;
    if (await writeSubsonic({ directoryLimit: limit })) {
      setSubsonicDirty(false);
      pushAlert({
        tone: 'success',
        title: t('protocols.servers.settingsSavedTitle'),
        message: t('protocols.servers.settingsSavedMessage'),
      });
    }
  }

  if (loading) {
    return (
      <div className="setup-layout">
        <div className="setup-placeholder">
          <InlineState kind="loading" title={t('protocols.loading.title')} message={t('protocols.loading.message')} />
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
            title={t('protocols.errorState.title')}
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
      </header>

      <div className="setup-grid">
        <section className="setup-section setup-section--full">
          <div className="setup-rows">
            {/* Loxone protocol server — driven by the deployment mode, not a switch. */}
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('protocols.servers.loxoneLabel')}</div>
                <div className="setup-row__desc">
                  {standalone
                    ? t('protocols.servers.loxoneDescStandalone')
                    : t('protocols.servers.loxoneDescLoxone')}
                </div>
              </div>
              <div className="setup-row__control">
                <span className={`setup-badge${standalone ? '' : ' setup-badge--ok'}`}>
                  {standalone ? t('protocols.servers.loxoneOff') : t('protocols.servers.required')}
                </span>
                <button
                  type="button"
                  className={`setup-toggle${standalone ? '' : ' is-on'}`}
                  aria-label={t('protocols.servers.loxoneLabel')}
                  aria-pressed={!standalone}
                  disabled
                  title={standalone ? t('protocols.servers.loxoneOffHint') : t('protocols.servers.requiredHint')}
                />
              </div>
            </div>

            {/* DLNA MediaServer — the inverse of the DLNA output: we serve content. */}
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('protocols.servers.dlnaLabel')}</div>
                <div className="setup-row__desc">{t('protocols.servers.dlnaDesc')}</div>
              </div>
              <div className="setup-row__control">
                <button
                  type="button"
                  className={`setup-toggle${mediaServerEnabled ? ' is-on' : ''}`}
                  aria-label={t('protocols.servers.dlnaLabel')}
                  aria-pressed={mediaServerEnabled}
                  disabled={serversSaving !== null}
                  onClick={() => void toggleMediaServer(!mediaServerEnabled)}
                />
              </div>
            </div>

            {/* Subsonic API server. */}
            <div className="setup-row">
              <div className="setup-row__info">
                <div className="setup-row__label">{t('protocols.servers.subsonicLabel')}</div>
                <div className="setup-row__desc">{t('protocols.servers.subsonicDesc')}</div>
              </div>
              <div className="setup-row__control">
                <button
                  type="button"
                  className={`setup-toggle${subsonicEnabled ? ' is-on' : ''}`}
                  aria-label={t('protocols.servers.subsonicLabel')}
                  aria-pressed={subsonicEnabled}
                  disabled={serversSaving !== null}
                  onClick={() => void toggleSubsonic(!subsonicEnabled)}
                />
              </div>
            </div>
          </div>

          {subsonicEnabled && subsonic ? (
            <div className="setup-subpanel">
              <div className="setup-facts">
                <div className="setup-facts__item">
                  <span className="setup-facts__label">{t('protocols.servers.subsonicUrl')}</span>
                  <span className="setup-facts__value setup-facts__value--link">
                    {subsonic.url}
                    <button type="button" className="setup-linkcopy" onClick={() => void copyClientUrl()}>
                      {urlCopied ? t('protocols.servers.copied') : t('protocols.servers.copy')}
                    </button>
                  </span>
                </div>
                <div className="setup-facts__item">
                  <span className="setup-facts__label">{t('protocols.servers.subsonicSignIn')}</span>
                  <span
                    className={`setup-facts__value ${subsonic.configured ? 'setup-status' : 'setup-status setup-status--warn'}`}
                  >
                    {subsonic.auth.loxone
                      ? t('protocols.servers.authLoxone')
                      : subsonic.auth.localUsers
                        ? t('protocols.servers.authLocal')
                        : t('protocols.servers.authNone')}
                  </span>
                </div>
                <div className="setup-facts__item">
                  <span className="setup-facts__label">{t('protocols.servers.subsonicLimit')}</span>
                  <form
                    className="setup-inlineform"
                    onSubmit={(event) => void saveSubsonicSettings(event)}
                  >
                    <div className="setup-input" style={{ width: 110 }}>
                      <input
                        type="number"
                        min={subsonic.directoryLimitBounds.min}
                        max={subsonic.directoryLimitBounds.max}
                        aria-label={t('protocols.servers.subsonicLimit')}
                        value={subsonicDraft.directoryLimit}
                        onChange={(event) => {
                          setSubsonicDraft({ directoryLimit: event.target.value });
                          setSubsonicDirty(true);
                        }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="setup-btn setup-btn--primary"
                      disabled={serversSaving !== null || !subsonicDirty}
                    >
                      {serversSaving === 'subsonic'
                        ? t('protocols.servers.saving')
                        : t('protocols.servers.subsonicSave')}
                    </button>
                  </form>
                </div>
              </div>

              {subsonicError ? (
                <div className="setup-note setup-note--warn">
                  <InfoGlyph />
                  <span>{subsonicError}</span>
                </div>
              ) : null}

              {!subsonic.auth.tokenAuthSupported ? (
                <div className="setup-note setup-note--warn">
                  <InfoGlyph />
                  <span>{t('protocols.servers.subsonicTokenWarning')}</span>
                </div>
              ) : null}

              {!subsonic.limitations.persistsStarsAndRatings || !subsonic.limitations.writablePlaylists ? (
                <div className="setup-note">
                  <InfoGlyph />
                  <span>{t('protocols.servers.subsonicLimitations')}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
