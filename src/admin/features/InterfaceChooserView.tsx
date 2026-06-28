import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import './InterfaceChooserView.css';
import type { StatusResponse } from '../types/api';

type InterfaceChooserViewProps = {
  currentUserName?: string;
  apiStatus?: StatusResponse | null;
  isLeaving?: boolean;
  onChooseAdmin: () => void;
};

const PLAYER_URL = '/player/';

function ChevronRight(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function AdminIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PlayerIcon(): JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function BrandMark(): JSX.Element {
  return (
    <svg viewBox="0 0 88 32" aria-hidden="true">
      <g fill="currentColor">
        <rect x="2" y="12" width="3" height="8" rx="1" opacity="0.4" />
        <rect x="10" y="7" width="3" height="18" rx="1" opacity="0.6" />
        <rect x="18" y="10" width="3" height="12" rx="1" opacity="0.8" />
        <rect x="26" y="5" width="3" height="22" rx="1" />
        <rect x="38" y="3" width="4" height="26" rx="1" />
        <rect x="50" y="5" width="3" height="22" rx="1" />
        <rect x="58" y="9" width="3" height="14" rx="1" opacity="0.9" />
        <rect x="66" y="6" width="3" height="20" rx="1" opacity="0.8" />
        <rect x="74" y="11" width="3" height="10" rx="1" opacity="0.7" />
        <rect x="82" y="13" width="3" height="6" rx="1" opacity="0.6" />
      </g>
    </svg>
  );
}

export default function InterfaceChooserView({
  currentUserName,
  apiStatus: _apiStatus,
  isLeaving,
  onChooseAdmin,
}: InterfaceChooserViewProps): JSX.Element {
  const { t } = useTranslation();
  const userName = currentUserName?.trim() || t('chooser.defaultUser');
  const [leavingPlayer, setLeavingPlayer] = React.useState(false);

  const handleAdminClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    onChooseAdmin();
  };

  const handlePlayerClick = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    if (leavingPlayer) return;
    setLeavingPlayer(true);
    // Hold the leave choreography for ~1.1s so the fade-out + veil are visible
    // before navigating to the external player.
    window.setTimeout(() => {
      window.location.href = PLAYER_URL;
    }, 1100);
  };

  return (
    <>
      <div className={`chooser-root${isLeaving ? ' is-leaving' : ''}${leavingPlayer ? ' is-leaving-player' : ''}`}>
        <p className="chooser-welcome">
          <Trans i18nKey="chooser.welcome" values={{ user: userName }}>
            <strong className="chooser-welcome__user" />
          </Trans>
        </p>

        <div className="chooser-choices">
          <a
            href="#"
            className="chooser-choice"
            onClick={handleAdminClick}
            aria-label={t('chooser.admin.eyebrow')}
          >
            <span className="chooser-choice__go" aria-hidden="true"><ChevronRight /></span>
            <span className="chooser-choice__icon" aria-hidden="true"><AdminIcon /></span>
            <span className="chooser-choice__name">{t('chooser.admin.eyebrow')}</span>
            <span className="chooser-choice__desc">{t('chooser.admin.desc')}</span>
          </a>

          <a
            href={PLAYER_URL}
            className="chooser-choice"
            onClick={handlePlayerClick}
            aria-label={t('chooser.player.eyebrow')}
          >
            <span className="chooser-choice__go" aria-hidden="true"><ChevronRight /></span>
            <span className="chooser-choice__icon" aria-hidden="true"><PlayerIcon /></span>
            <span className="chooser-choice__name">{t('chooser.player.eyebrow')}</span>
            <span className="chooser-choice__desc">{t('chooser.player.desc')}</span>
          </a>
        </div>
      </div>

      <div className={`chooser-leave-veil${leavingPlayer ? ' is-active' : ''}`} aria-hidden={!leavingPlayer}>
        <span className="chooser-leave-veil__mark">
          <BrandMark />
        </span>
        <span className="chooser-leave-veil__label">
          {t('chooser.openingPlayer')}<span className="chooser-leave-veil__dots" />
        </span>
      </div>
    </>
  );
}
