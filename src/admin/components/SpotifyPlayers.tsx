import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchSoloistStatus,
  saveSoloistSettings,
  uploadSoloistBinary,
  type SoloistStatus,
} from '../services/contentApi';

/** Days left before a build stops working at which the screen starts saying so. */
const EXPIRY_WARN_DAYS = 21;

/**
 * Where the program comes from — the downloads page itself, not the tutorial around it.
 *
 * Linked rather than fetched, and that is Spotify's own instruction: the archives may not be
 * redistributed, so pointing at this page is the only thing this screen is allowed to do. It is
 * also where a replacement comes from every ninety days, which is the trip most people will make.
 */
const SOLOIST_DOWNLOAD_URL =
  'https://developer.spotify.com/documentation/soloist/reference/downloads-and-updates';

type Props = {
  /** Linked Spotify accounts, for the built-in player's playback credentials. */
  accounts: Array<{ key: string; label: string }>;
  pairingAccountId: string | null;
  onPairAccount: (accountKey: string) => void;
  cacheEnabled: boolean;
  cacheSizeMb: number;
  onCacheChange: (patch: { cacheEnabled?: boolean; cacheSizeMb?: number }) => void;
  onSaveCache: () => void;
  cacheDirty: boolean;
  cacheSaving: boolean;
};

/**
 * Which player handles Spotify, and what each one needs.
 *
 * Presented as a choice between two rather than a list of settings, because that is what it is:
 * the built-in player is there and costs nothing, Soloist plays lossless and reaches accounts the
 * built-in one cannot but has to be installed and kept current by hand. Rooms are assigned
 * individually underneath, so one can be moved without committing the rest.
 */
export function SpotifyPlayers(props: Props): React.ReactElement {
  const { t } = useTranslation();
  /** Which card's setup is showing. The choice itself is `status.enabled`. */
  const [viewing, setViewing] = React.useState<'builtin' | 'soloist' | null>(null);
  const [status, setStatus] = React.useState<SoloistStatus | null>(null);
  const [apiKey, setApiKey] = React.useState('');
  const [editingKey, setEditingKey] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const fileInput = React.useRef<HTMLInputElement | null>(null);

  const load = React.useCallback(async () => {
    try {
      setStatus(await fetchSoloistStatus());
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<SoloistStatus>, okText?: string): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      setStatus(await action());
      if (okText) {
        setMessage({ kind: 'ok', text: okText });
      }
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const zones = status?.zones ?? [];
  const usingSoloist = status?.enabled === true;
  const selected = viewing ?? (usingSoloist ? 'soloist' : 'builtin');
  const unpaired = zones.filter((zone) => !zone.paired);
  // Read from the build stamp, so it is known as soon as the file is there rather than only
  // after something has played. Falls back to what a running Soloist reported about itself.
  const expiresInDays = status?.binary.expiresInDays ?? status?.expiry?.daysAtCheck;
  const expired = typeof expiresInDays === 'number' && expiresInDays <= 0;
  const expiringSoon = typeof expiresInDays === 'number' && !expired && expiresInDays <= EXPIRY_WARN_DAYS;

  return (
    <div className="spotify-players">
      <h3 className="spotify-players__heading">{t('content.players.heading')}</h3>

      <div className="spotify-players__choice">
        <button
          type="button"
          className={`player-card${!usingSoloist ? ' is-in-use' : ''}${selected === 'builtin' ? ' is-viewing' : ''}`}
          onClick={() => {
            setViewing('builtin');
            if (usingSoloist) {
              void run(() => saveSoloistSettings({ enabled: false }));
            }
          }}
        >
          <span className="player-card__name">
            {t('content.players.builtin.name')}
            {!usingSoloist ? (
              <span className="player-card__badge">{t('content.players.inUse')}</span>
            ) : null}
          </span>
          <span className="player-card__desc">{t('content.players.builtin.desc')}</span>
        </button>
        <button
          type="button"
          className={`player-card${usingSoloist ? ' is-in-use' : ''}${selected === 'soloist' ? ' is-viewing' : ''}`}
          onClick={() => {
            setViewing('soloist');
            if (!usingSoloist) {
              void run(() => saveSoloistSettings({ enabled: true }));
            }
          }}
        >
          <span className="player-card__name">
            {t('content.players.soloist.name')}
            <span className="player-card__tag">{t('content.soloist.experimental')}</span>
            {usingSoloist ? (
              <span className="player-card__badge">{t('content.players.inUse')}</span>
            ) : null}
          </span>
          <span className="player-card__desc">{t('content.players.soloist.desc')}</span>
        </button>
      </div>

      {selected === 'builtin' ? (
        <div className="spotify-players__panel">
          <div className="content-toggle-card">
            <div className="content-toggle-card__info">
              <h3 className="content-toggle-card__title">{t('content.spotify.cache.title')}</h3>
              <p className="content-toggle-card__desc">{t('content.spotify.cache.desc')}</p>
            </div>
            <div className="content-toggle-card__group">
              <span className="content-toggle-card__group-label">
                {t('content.spotify.cache.size')}
              </span>
              <div className="content-input content-input--inline" style={{ width: 120 }}>
                <input
                  type="number"
                  value={props.cacheSizeMb}
                  onChange={(event) =>
                    props.onCacheChange({ cacheSizeMb: Number(event.target.value) || 0 })
                  }
                />
                <span className="content-input__suffix">MB</span>
              </div>
            </div>
            <button
              type="button"
              className={`content-toggle${props.cacheEnabled ? ' is-on' : ''}`}
              aria-label={t('content.spotify.cache.title')}
              onClick={() => props.onCacheChange({ cacheEnabled: !props.cacheEnabled })}
            />
          </div>
          {/* Only this player needs it. Spotify stopped accepting the logins the server can mint
              for itself, so the built-in player has to be handed credentials from the Spotify app
              once per account. Soloist has its own login and never sees this. */}
          <div className="spotify-players__field">
            <h3 className="content-toggle-card__title">{t('content.players.builtin.credentials')}</h3>
            <p className="content-toggle-card__desc">
              {t('content.players.builtin.credentialsDesc')}
            </p>
            <div className="content-list">
              {props.accounts.map((account) => (
                <div key={account.key} className="content-list-row">
                  <div className="content-list-row__main">
                    <div className="content-list-row__title">{account.label || account.key}</div>
                  </div>
                  <div className="content-list-row__actions">
                    <button
                      type="button"
                      className="content-btn"
                      disabled={Boolean(props.pairingAccountId)}
                      onClick={() => props.onPairAccount(account.key)}
                    >
                      {props.pairingAccountId === account.key
                        ? t('content.spotify.pair.pairing')
                        : t('content.spotify.pair.action')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {props.cacheDirty ? (
            <div className="source-card__save-row" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="content-btn content-btn--primary"
                onClick={props.onSaveCache}
                disabled={props.cacheSaving}
              >
                {props.cacheSaving ? t('content.spotify.saving') : t('content.spotify.cache.save')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="spotify-players__panel">
          {/* Neither the program nor the key may be shipped, so both steps say who has to do it. */}
          <div className="content-toggle-card">
            <div className="content-toggle-card__info">
              <h3 className="content-toggle-card__title">{t('content.soloist.binary.title')}</h3>
              <p className="content-toggle-card__desc">
                {status?.binary.present
                  ? t('content.soloist.binary.present', {
                      version: status.binary.version ?? '?',
                      arch: status.hostArch,
                    })
                  : t('content.soloist.binary.missing', { arch: status?.hostArch ?? '' })}
                {status?.binary.present && typeof expiresInDays === 'number' ? (
                  <>
                    {' '}
                    <span className={expiringSoon || expired ? 'content-warn' : undefined}>
                      {expired
                        ? t('content.soloist.binary.expired')
                        : t('content.soloist.binary.expiresIn', { days: expiresInDays })}
                    </span>
                  </>
                ) : null}
              </p>
              {expiringSoon || expired ? (
                <p className="source-card__action-reason is-error">
                  {t('content.soloist.binary.expiring')}
                </p>
              ) : null}
              {!status?.binary.present ? (
                <p className="content-toggle-card__desc">{t('content.soloist.binary.accepts')}</p>
              ) : null}
              <p className="content-toggle-card__desc">
                <a
                  className="content-link"
                  href={SOLOIST_DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {t('content.soloist.binary.getIt')}
                </a>
              </p>
            </div>
            <div className="content-toggle-card__group">
              {/* No accept filter on purpose: the unpacked program has no extension, so any
                  filter that let the .tar.gz through would grey the other one out. */}
              <input
                ref={fileInput}
                type="file"
                style={{ display: 'none' }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) {
                    void run(() => uploadSoloistBinary(file), t('content.soloist.binary.stored'));
                  }
                }}
              />
              <button
                type="button"
                className="content-btn"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                {status?.binary.present
                  ? t('content.soloist.binary.replace')
                  : t('content.soloist.binary.upload')}
              </button>
            </div>
          </div>

          <div className="spotify-players__field">
            <h3 className="content-toggle-card__title">{t('content.soloist.key.title')}</h3>
            <p className="content-toggle-card__desc">{t('content.soloist.key.desc')}</p>
            {/* A saved key is never shown, so an empty box has to be told apart from an unset one —
                otherwise it reads as "nothing here" and someone pastes a second key over a working
                one, or goes looking for where it is really kept. */}
            {status?.hasApiKey && !editingKey ? (
              <div className="content-list-row">
                <div className="content-list-row__main">
                  <div className="content-list-row__title">{t('content.soloist.key.saved')}</div>
                </div>
                <div className="content-list-row__actions">
                  <button
                    type="button"
                    className="content-btn"
                    onClick={() => setEditingKey(true)}
                  >
                    {t('content.soloist.key.replace')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="spotify-players__field-row">
                <div className="content-input" style={{ flex: 1 }}>
                  <input
                    type="password"
                    value={apiKey}
                    placeholder={t('content.soloist.key.placeholder')}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="content-btn content-btn--primary"
                  disabled={busy || apiKey.trim().length === 0}
                  onClick={() =>
                    void run(() => saveSoloistSettings({ apiKey: apiKey.trim() })).then(() => {
                      setApiKey('');
                      setEditingKey(false);
                    })
                  }
                >
                  {t('content.soloist.key.save')}
                </button>
                {status?.hasApiKey ? (
                  <button type="button" className="content-btn" onClick={() => { setApiKey(''); setEditingKey(false); }}>
                    {t('content.spotify.cancel')}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}

      {usingSoloist ? (
        <div className="spotify-players__field">
          {/* Not an action: a zone's Soloist advertises itself and waits, so what is missing is
              someone picking it once in the Spotify app. Saying that is the whole of it. */}
          <h3 className="spotify-players__heading">{t('content.players.roomsTitle')}</h3>
          <p className="content-toggle-card__desc">
            {unpaired.length > 0
              ? t('content.players.roomsWaiting')
              : t('content.players.roomsReady')}
          </p>
          <div className="content-list">
            {zones.map((zone) => (
              <div key={zone.zoneId} className="content-list-row">
                <div className="content-list-row__main">
                  <div className="content-list-row__title">{zone.name ?? `#${zone.zoneId}`}</div>
                </div>
                <div className="content-list-row__actions">
                  <span className={zone.paired ? 'content-ok' : 'content-warn'}>
                    {zone.paired ? t('content.players.roomReady') : t('content.players.roomWaiting')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`source-card__action-reason${message.kind === 'error' ? ' is-error' : ''}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
