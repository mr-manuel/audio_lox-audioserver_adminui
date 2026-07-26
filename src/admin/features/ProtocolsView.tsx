import React from 'react';
import { useTranslation } from 'react-i18next';
// Shares the admin form language (sections, rows, tiles, toggles) with Setup;
// the stylesheet is the shared one rather than a duplicated `protocols-` copy.
import './SetupView.css';
import { getConfig } from '../services/setupApi';
import { updateInputsConfig, updateOutputsConfig } from '../services/contentApi';
import { getTransportDefinitions } from '../services/transportsApi';
import { useGlobalAlert } from '../components/GlobalAlert';
import { useConfirm } from '../components/ConfirmDialog';
import InlineState from '../components/InlineState';
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

  React.useEffect(() => {
    void refreshConfig();
    void refreshOutputs();
  }, [refreshConfig, refreshOutputs]);

  const cfg = data?.config ?? {};
  const inputs = cfg.inputs ?? {};

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

      </div>
    </div>
  );
}
