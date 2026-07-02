import React from 'react';
import { useTranslation } from 'react-i18next';
import Hero from './Hero';
import Tabs from './Tabs';
import AudioServerSwitcher from './AudioServerSwitcher';
import type { TabDescriptor } from './Tabs';
import type { StatusResponse } from '../types/api';
import { setLanguage, type Language } from '../i18n';
import { useUpdateCheck } from './UpdateCheckContext';

const REPO_URL = 'https://github.com/sonn-audio/core';

type ShellProps = {
  children: React.ReactNode;
  tabs?: readonly TabDescriptor[];
  activeTab?: string;
  onTabChange?: (next: string) => void;
  currentUserName?: string;
  onSignOut?: () => void;
  onSwitchServer: (base: string) => void;
  apiStatus?: StatusResponse | null;
};

type ThemeMode = 'dark' | 'light';
const THEME_STORAGE_KEY = 'lox-admin-theme';

function readStoredTheme(): ThemeMode {
  // Light mode is being polished — locked to dark for now. Any stored
  // 'light' from an earlier session is ignored until we re-enable it.
  return 'dark';
}

export default function Shell({
  children,
  tabs,
  activeTab,
  onTabChange,
  currentUserName,
  onSignOut,
  onSwitchServer,
  apiStatus,
}: ShellProps): JSX.Element {
  const { t, i18n } = useTranslation();
  const { hasUpdates, requestUpdatesFocus } = useUpdateCheck();
  const [headerScrolled, setHeaderScrolled] = React.useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const [theme, setTheme] = React.useState<ThemeMode>(readStoredTheme);
  const accountRef = React.useRef<HTMLDivElement | null>(null);
  const currentLanguage = (i18n.language?.split('-')[0] as Language) || 'en';

  // Apply theme to the document body so all components inherit via CSS vars.
  React.useEffect(() => {
    document.body.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'light' ? '#F4F5F7' : '#0A0C10');
    }
  }, [theme]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => setHeaderScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  React.useEffect(() => {
    if (!accountMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (accountRef.current && target && accountRef.current.contains(target)) return;
      setAccountMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [accountMenuOpen]);

  const systemName = apiStatus?.name?.trim() || 'AudioServer';
  const systemInitial = systemName.charAt(0).toUpperCase() || 'A';
  const userLabel = currentUserName?.trim() || 'Admin';
  const userInitial = userLabel.charAt(0).toUpperCase() || 'A';
  // The account menu (theme, language, server switcher, player link) is available
  // throughout the admin shell — `tabs` is only passed in shell mode. Sign-out and
  // the user identity header are gated separately on `onSignOut` (auth present);
  // standalone runs without authentication but still needs the menu.
  const menuOpenable = Boolean(tabs);

  return (
    <div className="shell">
      <div className="success-pulse" aria-hidden="true" />
      <div className="top-strip">
        <div className="top-strip__left">
          <div className="system-id">
            <div className="system-id__avatar" aria-hidden="true">
              {systemInitial}
            </div>
            <div className="system-id__name">{systemName}</div>
          </div>
        </div>
        <div className="top-strip__actions">
          {onTabChange && hasUpdates ? (
            <button
              type="button"
              className="top-chip top-chip--warn"
              onClick={() => {
                onTabChange('setup');
                requestUpdatesFocus();
              }}
              title={t('shell.updatesAvailableTitle')}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2v10" />
                <path d="M6 8l6-6 6 6" />
                <path d="M4 16v4h16v-4" />
              </svg>
              {t('shell.updatesAvailable')}
            </button>
          ) : null}
          <a className="top-chip" href={REPO_URL} target="_blank" rel="noreferrer">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.7.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
            </svg>
            {t('shell.github')}
          </a>
          <a className="top-chip" href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
            {t('shell.docs')}
          </a>
          <div
            ref={accountRef}
            className={`user-pill${menuOpenable ? ' is-in' : ''}${accountMenuOpen ? ' is-open' : ''}`}
          >
            <button
              type="button"
              className="user-pill__trigger"
              onClick={() => menuOpenable && setAccountMenuOpen((prev) => !prev)}
              aria-haspopup={menuOpenable ? 'menu' : undefined}
              aria-expanded={menuOpenable ? accountMenuOpen : undefined}
              aria-label={menuOpenable ? 'Account menu' : 'Not signed in'}
              disabled={!menuOpenable}
            >
              <span className="user-pill__avatar" aria-hidden="true">
                <span className="user-pill__avatar-glyph">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span className="user-pill__avatar-initial">{userInitial}</span>
                <span className="user-pill__online" aria-hidden="true" />
              </span>
              <span className="user-pill__name-wrap">
                <span className="user-pill__name">{userLabel}</span>
              </span>
              <svg
                className="user-pill__chevron"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpenable ? (
              <div className="user-menu" role="menu" aria-hidden={!accountMenuOpen}>
                {onSignOut ? (
                  <>
                    <div className="user-menu__head">
                      <span className="user-menu__head-avatar" aria-hidden="true">{userInitial}</span>
                      <div className="user-menu__head-id">
                        <div className="user-menu__name">{userLabel}</div>
                        <div className="user-menu__role">{t('shell.menu.role')}</div>
                      </div>
                    </div>
                    <div className="user-menu__divider" />
                  </>
                ) : null}
                <div className="user-menu__label">{t('shell.menu.appearance')}</div>
                <div className="user-menu__theme" role="radiogroup" aria-label={t('shell.menu.appearance')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === 'dark'}
                    className={`user-menu__theme-btn${theme === 'dark' ? ' is-active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    {t('shell.menu.themeDark')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === 'light'}
                    className={`user-menu__theme-btn${theme === 'light' ? ' is-active' : ''}`}
                    disabled
                    title={t('shell.menu.themeLightTitle')}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
                    </svg>
                    {t('shell.menu.themeLight')}
                  </button>
                </div>
                <div className="user-menu__divider" />
                <div className="user-menu__label">{t('shell.menu.language')}</div>
                <div className="user-menu__theme" role="radiogroup" aria-label={t('shell.menu.language')}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentLanguage === 'en'}
                    className={`user-menu__theme-btn${currentLanguage === 'en' ? ' is-active' : ''}`}
                    onClick={() => setLanguage('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={currentLanguage === 'de'}
                    className={`user-menu__theme-btn${currentLanguage === 'de' ? ' is-active' : ''}`}
                    onClick={() => setLanguage('de')}
                  >
                    DE
                  </button>
                </div>
                <AudioServerSwitcher onSwitch={onSwitchServer} />
                <div className="user-menu__divider" />
                <a
                  href="/player/"
                  target="_blank"
                  rel="noreferrer"
                  className="user-menu__item"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  {t('shell.menu.playerUi')}
                  <svg
                    className="user-menu__arrow"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </a>
                {onSignOut ? (
                  <button
                    type="button"
                    className="user-menu__item user-menu__item--danger"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      onSignOut();
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    {t('shell.menu.signOut')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <header className={`hero${headerScrolled ? ' is-scrolled' : ''}`}>
        <Hero />
        {tabs && activeTab && onTabChange ? (
          <Tabs active={activeTab} tabs={tabs} onChange={onTabChange} />
        ) : null}
      </header>

      <main id="app">{children}</main>
    </div>
  );
}
