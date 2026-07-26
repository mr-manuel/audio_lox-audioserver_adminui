import React from 'react';
import { useTranslation } from 'react-i18next';
import './WelcomeView.css';

type WelcomeViewProps = {
  onCreateAdmin: (username: string, password: string) => Promise<void> | void;
  isLeaving?: boolean;
};

function ChevronRight(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

// First-run, two steps: a branded "get started" intro, then create the local admin
// account that guards the admin UI. Each step re-mounts (keyed) so it animates in
// alongside the hero's intro rather than sitting there statically. No deployment-mode
// fork — Loxone is connected later from the Players screen.
export default function WelcomeView({ onCreateAdmin, isLeaving }: WelcomeViewProps): JSX.Element {
  const { t } = useTranslation();
  const [step, setStep] = React.useState<'intro' | 'create'>('intro');
  // The initial entrance is timed to land after the hero's ~2s intro. Once the user
  // interacts, later step swaps should snap in — they're not waiting on the hero.
  const [instant, setInstant] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit = username.trim().length > 0 && password.length > 0 && !pending;

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      await onCreateAdmin(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('welcome.createFailed'));
      setPending(false);
    }
  };

  return (
    <div className={`welcome-root${isLeaving ? ' is-leaving' : ''}${pending ? ' is-committing' : ''}`}>
      <p className="welcome-eyebrow">{t('welcome.eyebrow')}</p>

      {step === 'intro' ? (
        <div key="intro" className={`welcome-step${instant ? ' is-quick' : ''}`}>
          <h2 className="welcome-title">{t('welcome.title')}</h2>
          <p className="welcome-intro">{t('welcome.introStep1')}</p>
          <button
            type="button"
            className="welcome-start"
            onClick={() => {
              setInstant(true);
              setStep('create');
            }}
          >
            <span className="welcome-start__label">{t('welcome.getStarted')}</span>
            <span className="welcome-start__go" aria-hidden="true"><ChevronRight /></span>
          </button>
        </div>
      ) : (
        <div key="create" className={`welcome-step${instant ? ' is-quick' : ''}`}>
          <h2 className="welcome-title">{t('welcome.createTitle')}</h2>
          <p className="welcome-intro">{t('welcome.introStep2')}</p>

          <form className="welcome-form" onSubmit={(e) => void handleSubmit(e)}>
            <label className="welcome-field">
              <span className="welcome-field__label">{t('welcome.usernameLabel')}</span>
              <input
                type="text"
                autoComplete="username"
                className="welcome-input"
                value={username}
                maxLength={64}
                disabled={pending}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </label>
            <label className="welcome-field">
              <span className="welcome-field__label">{t('welcome.passwordLabel')}</span>
              <input
                type="password"
                autoComplete="new-password"
                className="welcome-input"
                value={password}
                maxLength={256}
                disabled={pending}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {error ? <p className="welcome-error">{error}</p> : null}

            <button type="submit" className="welcome-start" disabled={!canSubmit}>
              <span className="welcome-start__label">
                {pending ? t('welcome.creating') : t('welcome.createAdmin')}
              </span>
              <span className="welcome-start__go" aria-hidden="true"><ChevronRight /></span>
            </button>
          </form>

          <button
            type="button"
            className="welcome-back"
            onClick={() => setStep('intro')}
            disabled={pending}
          >
            {t('welcome.back')}
          </button>
        </div>
      )}
    </div>
  );
}
