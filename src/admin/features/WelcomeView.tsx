import React from 'react';
import { useTranslation } from 'react-i18next';
import './WelcomeView.css';

type DeploymentMode = 'loxone' | 'standalone';

type WelcomeViewProps = {
  onChoose: (mode: DeploymentMode) => Promise<void> | void;
  isLeaving?: boolean;
};

function ChevronRight(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function StandaloneIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <line x1="7" y1="7" x2="7" y2="7" />
      <line x1="7" y1="17" x2="7" y2="17" />
    </svg>
  );
}

function LoxoneIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export default function WelcomeView({ onChoose, isLeaving }: WelcomeViewProps): JSX.Element {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState<DeploymentMode | null>(null);

  const handleChoose = async (mode: DeploymentMode): Promise<void> => {
    if (pending) return;
    setPending(mode);
    try {
      await onChoose(mode);
    } catch {
      // Let the user retry if persisting the choice failed.
      setPending(null);
    }
  };

  const choices: Array<{ mode: DeploymentMode; icon: JSX.Element }> = [
    { mode: 'standalone', icon: <StandaloneIcon /> },
    { mode: 'loxone', icon: <LoxoneIcon /> },
  ];

  return (
    <div className={`welcome-root${isLeaving ? ' is-leaving' : ''}${pending ? ' is-committing' : ''}`}>
      <p className="welcome-eyebrow">{t('welcome.eyebrow')}</p>
      <h2 className="welcome-title">{t('welcome.title')}</h2>
      <p className="welcome-intro">{t('welcome.intro')}</p>

      <div className="welcome-choices">
        {choices.map(({ mode, icon }) => (
          <button
            key={mode}
            type="button"
            className={`welcome-choice${pending === mode ? ' is-pending' : ''}`}
            onClick={() => void handleChoose(mode)}
            disabled={pending !== null}
            aria-label={t(`welcome.${mode}.title`)}
          >
            <span className="welcome-choice__go" aria-hidden="true"><ChevronRight /></span>
            <span className="welcome-choice__icon" aria-hidden="true">{icon}</span>
            <span className="welcome-choice__name">{t(`welcome.${mode}.title`)}</span>
            <span className="welcome-choice__desc">{t(`welcome.${mode}.desc`)}</span>
          </button>
        ))}
      </div>

      <p className="welcome-foot">{t('welcome.foot')}</p>
    </div>
  );
}
