import React from 'react';
import { useTranslation } from 'react-i18next';
// Shares the admin form language (sections, rows, tiles, toggles) with Setup;
// the stylesheet is the shared one rather than a duplicated `protocols-` copy.
import './SetupView.css';
import { getConfig } from '../services/setupApi';
import { updateContentConfig, updateInputsConfig, updateOutputsConfig } from '../services/contentApi';
import { getTransportDefinitions } from '../services/transportsApi';
import {
  getSubsonicStatus,
  updateSubsonicConfig,
  SubsonicConfigError,
  type SubsonicStatus,
} from '../services/subsonicApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import { useConfirm } from '../components/ConfirmDialog';
import InlineState from '../components/InlineState';
import { copyText } from '../utils/clipboard';
import type { RootConfig } from '../types/config';
import type { TransportConfigDefinition } from '@/ports/OutputsTypes';

type ConfigResponse = { config: RootConfig };

type InputKey = 'airplay' | 'spotify' | 'dlna';

/** Output ids the zone picker never offers, so they are not on offer here either. */
const HIDDEN_OUTPUT_IDS = new Set(['snapcast-cast']);

/** Provider artwork, keyed by input/output/server id. Everything else gets the glyph. */
const ICONS: Record<string, string> = {
  airplay: 'providers/airplay.svg',
  dlna: 'providers/dlna.svg',
  googleCast: 'providers/cast.svg',
  musicassistant: 'providers/music-assistant.svg',
  sendspin: 'providers/sendspin.svg',
  snapcast: 'providers/snapcast.svg',
  sonos: 'providers/sonos.svg',
  squeezelite: 'providers/squeezelite.svg',
  // Content providers, for the exposed-services tiles.
  applemusic: 'providers/apple-music.svg',
  deezer: 'providers/deezer.svg',
  soundcloud: 'providers/soundcloud.svg',
  tidal: 'providers/tidal.svg',
  youtube: 'providers/youtube.svg',
  ytmusic: 'providers/youtube-music.svg',
};

function InfoGlyph(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.5" x2="12" y2="7.6" />
    </svg>
  );
}

/** The two built-in services ship no brand artwork, so they get their own mark. */
function LibraryGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  );
}

function RadioGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7.4 16.6a6.5 6.5 0 0 1 0-9.2M16.6 7.4a6.5 6.5 0 0 1 0 9.2" />
      <path d="M4.4 19.6a10.7 10.7 0 0 1 0-15.2M19.6 4.4a10.7 10.7 0 0 1 0 15.2" opacity="0.5" />
    </svg>
  );
}

/** Fallback tile mark for protocols that ship no artwork. */
function WaveGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="10" x2="5" y2="14" />
      <line x1="9.5" y1="7" x2="9.5" y2="17" />
      <line x1="14" y1="4.5" x2="14" y2="19.5" />
      <line x1="18.5" y1="9" x2="18.5" y2="15" />
    </svg>
  );
}

/** Brand artwork when we ship it, a purpose-drawn glyph otherwise. */
function ProviderMark({ id }: { id: string }): JSX.Element {
  const icon = ICONS[id];
  if (icon) return <img src={`${import.meta.env.BASE_URL || '/'}${icon}`} alt="" />;
  if (id === 'library') return <LibraryGlyph />;
  if (id === 'radio') return <RadioGlyph />;
  return <WaveGlyph />;
}

type TileProps = {
  id: string;
  name: string;
  desc: string;
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
  foot?: string;
  footAccent?: boolean;
};

function ProtocolTile({ id, name, desc, on, busy, onToggle, foot, footAccent }: TileProps): JSX.Element {
  return (
    <div className={`setup-tile${on ? ' is-on' : ''}`}>
      <div className="setup-tile__head">
        <span className="setup-tile__icon" aria-hidden="true">
          <ProviderMark id={id} />
        </span>
        <span className="setup-tile__name">{name}</span>
        <button
          type="button"
          className={`setup-toggle${on ? ' is-on' : ''}`}
          aria-label={name}
          aria-pressed={on}
          disabled={busy}
          onClick={onToggle}
        />
      </div>
      {desc ? <p className="setup-tile__desc">{desc}</p> : null}
      {foot ? (
        <div className={`setup-tile__foot${footAccent ? ' setup-tile__foot--accent' : ''}`}>{foot}</div>
      ) : null}
    </div>
  );
}

export default function ProtocolsView(): JSX.Element {
  const { t } = useTranslation();
  const { push: pushAlert } = useGlobalAlert();
  const { confirm } = useConfirm();

  const [data, setData] = React.useState<ConfigResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [outputDefs, setOutputDefs] = React.useState<TransportConfigDefinition[] | null>(null);
  const [inputsSaving, setInputsSaving] = React.useState(false);
  const [outputsSaving, setOutputsSaving] = React.useState<string | null>(null);
  const [serversSaving, setServersSaving] = React.useState<string | null>(null);
  // Subsonic has its own admin endpoint that resolves more than the raw config
  // (client URL, per-bridge service catalogue, bounds), so it is loaded and
  // written separately from the rest of the content config.
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

  // The catalogue and its availability flags come from the same endpoint the
  // zone picker reads, so the two views can never disagree on what is on offer.
  const refreshOutputs = React.useCallback(async (): Promise<void> => {
    try {
      setOutputDefs(await getTransportDefinitions());
    } catch {
      setOutputDefs([]);
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
    void refreshOutputs();
    void refreshSubsonic();
  }, [refreshConfig, refreshOutputs, refreshSubsonic]);

  const cfg = data?.config ?? {};
  const inputs = cfg.inputs ?? {};
  const content = cfg.content ?? {};
  const standalone = cfg.system?.audioserver?.mode === 'standalone';
  React.useEffect(() => {
    if (!subsonicDirty && subsonic) {
      setSubsonicDraft({ directoryLimit: String(subsonic.directoryLimit) });
    }
  }, [subsonic, subsonicDirty]);

  // How many zones each output type is configured on: shown on the tile, and
  // used to warn before an in-use output is taken out of the picker.
  const outputUsage = React.useMemo(() => {
    const usage = new Map<string, number>();
    for (const raw of Array.isArray(cfg.zones) ? cfg.zones : []) {
      const zone = raw as { output?: { id?: string } | null; transports?: Array<{ id?: string }> };
      const id = zone?.output?.id ?? zone?.transports?.[0]?.id;
      if (typeof id === 'string' && id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    return usage;
  }, [cfg.zones]);

  const visibleOutputs = (outputDefs ?? []).filter((def) => !HIDDEN_OUTPUT_IDS.has(def.id));
  const enabledOutputCount = visibleOutputs.filter((def) => def.enabled !== false).length;
  const airplayEnabled = Boolean(inputs.airplay?.enabled ?? false);
  const spotifyEnabled = Boolean(inputs.spotify?.enabled ?? false);
  const dlnaEnabled = Boolean(inputs.dlna?.enabled ?? false);
  const mediaServerEnabled = Boolean(content.mediaServer?.enabled);
  const subsonicEnabled = subsonic?.enabled ?? false;

  async function toggleInput(key: InputKey, next: boolean): Promise<void> {
    if (inputsSaving) return;
    setInputsSaving(true);
    try {
      await updateInputsConfig({ [key]: { enabled: next } });
      await refreshConfig();
    } catch (err) {
      pushAlert({
        tone: 'error',
        title: t('protocols.inputs.failedTitle'),
        message: err instanceof Error ? err.message : t('protocols.inputs.failedMessage', { key }),
      });
    } finally {
      setInputsSaving(false);
    }
  }

  // Availability only: switching an output off removes it from the zone picker,
  // it never rewrites a zone already using it — so warn rather than block.
  async function toggleOutput(id: string, label: string, next: boolean): Promise<void> {
    if (outputsSaving) return;
    const inUse = outputUsage.get(id) ?? 0;
    if (!next && inUse > 0) {
      const ok = await confirm({
        title: t('protocols.outputs.disableConfirmTitle', { label }),
        message: t('protocols.outputs.disableConfirmMessage', { count: inUse }),
        confirmLabel: t('protocols.outputs.disableConfirmOk'),
        cancelLabel: t('protocols.cancel'),
      });
      if (!ok) return;
    }
    setOutputsSaving(id);
    setOutputDefs((prev) => prev?.map((def) => (def.id === id ? { ...def, enabled: next } : def)) ?? prev);
    try {
      await updateOutputsConfig({ [id]: { enabled: next } });
    } catch (err) {
      pushAlert({
        tone: 'error',
        title: t('protocols.outputs.failedTitle'),
        message: err instanceof Error ? err.message : t('protocols.outputs.failedMessage', { label }),
      });
    } finally {
      await refreshOutputs();
      setOutputsSaving(null);
    }
  }

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

  /**
   * Maps the endpoint's validation codes onto copy. `credentials-required` is
   * the expected one: the server refuses to enable an API that would answer
   * every client with "not authorized", so we say what is missing instead of
   * reporting a generic failure.
   */
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

  /** Every Subsonic write goes through here; the response IS the fresh status. */
  async function writeSubsonic(payload: Parameters<typeof updateSubsonicConfig>[0]): Promise<boolean> {
    setServersSaving('subsonic');
    setSubsonicError(null);
    try {
      setSubsonic(await updateSubsonicConfig(payload));
      return true;
    } catch (err) {
      const text = subsonicErrorText(err);
      setSubsonicError(text);
      // The inline note lives inside the panel, which is only rendered while
      // Subsonic is on — so a refused *enable* would otherwise fail silently.
      // Nothing here can fix it either (accounts live under Users), so say it
      // where it is always visible.
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
    // Enabling is only refused when no credential source exists at all, which is
    // fixed under Users rather than here — writeSubsonic surfaces the reason.
    if (await writeSubsonic({ enabled: next })) setSubsonicDirty(false);
  }

  async function toggleServiceProvider(provider: string, next: boolean): Promise<void> {
    if (!subsonic || serversSaving) return;
    const selected = new Set(
      subsonic.providerOptions.filter((option) => option.enabled).map((option) => option.provider),
    );
    if (next) selected.add(provider);
    else selected.delete(provider);
    // All of them selected is stored as "no restriction", so a bridge added
    // later is exposed too instead of silently missing from a frozen list.
    const all = subsonic.providerOptions.length;
    await writeSubsonic({ providers: selected.size === all ? null : [...selected] });
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
            action={{ label: t('protocols.errorState.retry'), onClick: () => void refreshConfig() }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="setup-layout">
      <header className="setup-head">
        <div className="setup-head__main">
          <p className="setup-eyebrow">{t('protocols.eyebrow')}</p>
          <h1 className="setup-title">{t('protocols.title')}</h1>
          <p className="setup-subtitle">{t('protocols.subtitle')}</p>
        </div>
      </header>

      <div className="setup-grid">
        {/* ===== Inputs: what a zone can receive ===== */}
        <section className="setup-section setup-section--full">
          <header className="setup-section__head">
            <div className="setup-section__head-main">
              <span className="setup-section__eyebrow setup-section__eyebrow--info">{t('protocols.inputs.eyebrow')}</span>
              <h2 className="setup-section__title">{t('protocols.inputs.title')}</h2>
              <p className="setup-section__desc">{t('protocols.inputs.desc')}</p>
            </div>
          </header>

          <div className="setup-tiles">
            <ProtocolTile
              id="airplay"
              name={t('protocols.inputs.airplayLabel')}
              desc={t('protocols.inputs.airplayDesc')}
              on={airplayEnabled}
              busy={inputsSaving}
              onToggle={() => void toggleInput('airplay', !airplayEnabled)}
            />
            <ProtocolTile
              id="spotify"
              name={t('protocols.inputs.spotifyLabel')}
              desc={t('protocols.inputs.spotifyDesc')}
              on={spotifyEnabled}
              busy={inputsSaving}
              onToggle={() => void toggleInput('spotify', !spotifyEnabled)}
            />
            <ProtocolTile
              id="dlna"
              name={t('protocols.inputs.dlnaLabel')}
              desc={t('protocols.inputs.dlnaDesc')}
              on={dlnaEnabled}
              busy={inputsSaving}
              onToggle={() => void toggleInput('dlna', !dlnaEnabled)}
            />
          </div>

          <div className="setup-note">
            <InfoGlyph />
            <span>{t('protocols.inputs.note')}</span>
          </div>
        </section>

        {/* ===== Outputs: what a zone can play to ===== */}
        <section className="setup-section setup-section--full">
          <header className="setup-section__head">
            <div className="setup-section__head-main">
              <span className="setup-section__eyebrow setup-section__eyebrow--info">{t('protocols.outputs.eyebrow')}</span>
              <h2 className="setup-section__title">{t('protocols.outputs.title')}</h2>
              <p className="setup-section__desc">{t('protocols.outputs.desc')}</p>
            </div>
            {outputDefs ? (
              <span className="setup-badge">
                {t('protocols.outputs.count', { enabled: enabledOutputCount, total: visibleOutputs.length })}
              </span>
            ) : null}
          </header>

          {outputDefs === null ? (
            <div className="setup-note">
              <InfoGlyph />
              <span>{t('protocols.outputs.loading')}</span>
            </div>
          ) : visibleOutputs.length === 0 ? (
            <div className="setup-note">
              <InfoGlyph />
              <span>{t('protocols.outputs.unavailable')}</span>
            </div>
          ) : (
            <div className="setup-tiles">
              {visibleOutputs.map((def) => {
                const on = def.enabled !== false;
                const used = outputUsage.get(def.id) ?? 0;
                return (
                  <ProtocolTile
                    key={def.id}
                    id={def.id}
                    name={def.label}
                    desc={def.description ?? ''}
                    on={on}
                    busy={outputsSaving !== null}
                    onToggle={() => void toggleOutput(def.id, def.label, !on)}
                    foot={used > 0 ? t('protocols.outputs.inUse', { count: used }) : undefined}
                    footAccent={used > 0}
                  />
                );
              })}
            </div>
          )}

          <div className="setup-note">
            <InfoGlyph />
            <span>{t('protocols.outputs.note')}</span>
          </div>
        </section>

        {/* ===== Servers: what this box exposes to the network ===== */}
        <section className="setup-section setup-section--full">
          <header className="setup-section__head">
            <div className="setup-section__head-main">
              <span className="setup-section__eyebrow setup-section__eyebrow--info">{t('protocols.servers.eyebrow')}</span>
              <h2 className="setup-section__title">{t('protocols.servers.title')}</h2>
              <p className="setup-section__desc">{t('protocols.servers.desc')}</p>
            </div>
          </header>

          <div className="setup-rows">
            {/* Driven by the deployment mode, not by a switch: Loxone mode always
                runs the protocol server, and standalone gates the whole Loxone
                role off ("uit is uit"), so there is nothing to toggle either way. */}
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

          {/* The status endpoint resolves the client URL and the per-bridge service
              catalogue, so this panel shows what the server actually exposes
              rather than a second interpretation of the raw config. */}
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

              {/* Most clients default to salted-token auth, which the Miniserver
                  cannot answer — say so before someone debugs a login loop. */}
              {!subsonic.auth.tokenAuthSupported ? (
                <div className="setup-note setup-note--warn">
                  <InfoGlyph />
                  <span>{t('protocols.servers.subsonicTokenWarning')}</span>
                </div>
              ) : null}

              {/* One control per provider: the allowlist works at provider level,
                  and the caption carries what the resolved services underneath
                  can actually do — so the same names are not listed twice. */}
              <div className="setup-fieldlabel">{t('protocols.servers.subsonicExposed')}</div>
              <div className="setup-tiles setup-tiles--compact">
                {subsonic.providerOptions.map((option) => {
                  const owned = subsonic.services.filter((service) => service.provider === option.provider);
                  const searchable = owned.some((service) => service.searchable);
                  const caption = !option.enabled
                    ? t('protocols.servers.serviceHidden')
                    : searchable
                      ? t('protocols.servers.serviceBrowseSearch')
                      : t('protocols.servers.serviceBrowseOnly');
                  return (
                    <div
                      key={option.provider}
                      className={`setup-tile setup-tile--compact${option.enabled ? ' is-on' : ''}`}
                    >
                      <div className="setup-tile__head">
                        <span className="setup-tile__icon" aria-hidden="true">
                          <ProviderMark id={option.provider} />
                        </span>
                        <span className="setup-tile__name">{option.label}</span>
                        <button
                          type="button"
                          className={`setup-toggle${option.enabled ? ' is-on' : ''}`}
                          aria-label={option.label}
                          aria-pressed={option.enabled}
                          disabled={serversSaving !== null}
                          onClick={() => void toggleServiceProvider(option.provider, !option.enabled)}
                        />
                      </div>
                      <div className="setup-tile__caption">
                        {caption}
                        {owned.length > 1 ? ` · ${t('protocols.servers.serviceSources', { count: owned.length })}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>

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
