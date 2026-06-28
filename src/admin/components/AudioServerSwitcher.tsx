import React from 'react';
import { useTranslation } from 'react-i18next';
import { activeApiHost, buildAdminBaseForHost } from '../config/apiConfig';
import { fetchAudioServers, type AudioServerEntry } from '../services/systemApi';

const SAME_ORIGIN_BASE = '/admin/api';

// The base to talk to a given server: same-origin when it's the server that served this bundle
// (the cookie still works), otherwise an absolute peer URL (bearer token).
function baseForServer(server: AudioServerEntry): string {
  if (server.host && typeof window !== 'undefined' && window.location.hostname === server.host) {
    return SAME_ORIGIN_BASE;
  }
  return server.host ? buildAdminBaseForHost(server.host) : SAME_ORIGIN_BASE;
}

type AudioServerSwitcherProps = {
  // 'menu' renders inside the user dropdown (with a leading divider); 'login' renders as a
  // form field on the login screen so a server can be picked before authenticating.
  variant?: 'menu' | 'login';
  // Switch the app to a given API base. The parent re-bootstraps in place (no full reload).
  onSwitch: (base: string) => void;
};

/**
 * Lists the audioservers the Miniserver knows about and switches the whole admin UI to one.
 * Selecting a server just re-points the API base and reloads — authentication is handled by the
 * app's normal login screen against the now-active server (or skipped if a valid token/cookie for
 * it already exists). The peer has its own session, so its bearer token is stored per base on login.
 */
export default function AudioServerSwitcher({ variant = 'menu', onSwitch }: AudioServerSwitcherProps): JSX.Element | null {
  const { t } = useTranslation();
  const [servers, setServers] = React.useState<AudioServerEntry[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchAudioServers()
      .then((res) => {
        if (cancelled) return;
        // The Miniserver's config also lists real Loxone audioservers, which share the protocol
        // (so the player works with them) but run no admin. The backend flags ours via mDNS
        // (isSonnCore) — keep only those. The active/origin server is always kept as a safety
        // net so a flaky mDNS view can never strand the UI without a way back.
        const keep = new Set(
          [typeof window !== 'undefined' ? window.location.hostname : null, activeApiHost()].filter(
            Boolean,
          ) as string[],
        );
        setServers(res.servers.filter((s) => s.isSonnCore || (s.host != null && keep.has(s.host))));
      })
      .catch(() => {
        if (cancelled) return;
        // Discovery is a progressive enhancement (e.g. the endpoint may be auth-gated on an
        // older backend). Fail silently — just don't offer the switcher rather than show an error.
        setServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The server we're actively talking to (by host) — not necessarily the origin: when pointed at
  // a peer, that peer is "current". Computed client-side from the active base, since the list comes
  // from the origin (whose own isSelf flag would always mark the origin).
  const current = activeApiHost();

  const onSelect = (server: AudioServerEntry, isCurrent: boolean): void => {
    if (isCurrent) return;
    onSwitch(baseForServer(server));
  };

  // Hidden until we have at least two servers to switch between (and while still loading).
  if (!servers || servers.length <= 1) return null;

  // Login screen: a <select> rendered as a normal sign-in form field (under password). The
  // currently-active server is the selected option; choosing another switches to it.
  if (variant === 'login') {
    const currentServer = servers.find((s) => current != null && s.host === current);
    return (
      <div className="signin-field">
        <label className="signin-field__label" htmlFor="audioserver-select">
          {t('shell.menu.servers')}
        </label>
        <div className="signin-field__wrap">
          <span className="signin-field__icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="8" rx="2" ry="2" />
              <rect x="2" y="13" width="20" height="8" rx="2" ry="2" />
              <line x1="6" y1="7" x2="6.01" y2="7" />
              <line x1="6" y1="17" x2="6.01" y2="17" />
            </svg>
          </span>
          <select
            id="audioserver-select"
            className="signin-field__input signin-field__select"
            value={currentServer?.macId ?? ''}
            onChange={(event) => {
              const target = servers.find((s) => s.macId === event.target.value);
              if (target) onSelect(target, current != null && target.host === current);
            }}
          >
            {servers.map((server) => {
              const name = server.name || server.host || server.macId;
              return (
                <option key={server.macId} value={server.macId}>
                  {server.host ? `${name} — ${server.host}` : name}
                </option>
              );
            })}
          </select>
          <svg className="signin-field__select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>
    );
  }

  // User menu: a list of buttons (the current one flagged + disabled).
  return (
    <>
      <div className="user-menu__divider" />
      <div className="server-switch">
        <div className="user-menu__label">{t('shell.menu.servers')}</div>
        <div className="server-switch__list" role="menu">
          {servers.map((server) => {
            const label = server.name || server.host || server.macId;
            const isCurrent = current != null && server.host === current;
            return (
              <button
                key={server.macId}
                type="button"
                role="menuitem"
                className={`server-switch__item${isCurrent ? ' is-current' : ''}`}
                onClick={() => onSelect(server, isCurrent)}
                disabled={isCurrent}
                title={server.host ?? undefined}
              >
                <span className="server-switch__dot" aria-hidden="true" />
                <span className="server-switch__name">{label}</span>
                {isCurrent ? (
                  <span className="server-switch__tag">{t('shell.menu.serverCurrent')}</span>
                ) : (
                  <span className="server-switch__host">{server.host}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
