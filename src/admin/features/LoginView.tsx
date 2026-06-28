import React from 'react';
import { useTranslation } from 'react-i18next';
import AudioServerSwitcher from '../components/AudioServerSwitcher';

type LoginViewProps = {
  initialUsername: string;
  submitting: boolean;
  notice?: string | null;
  error: string | null;
  isLeaving?: boolean;
  onSubmit: (payload: { username: string; password: string }) => Promise<void>;
  onSwitchServer: (base: string) => void;
};

export default function LoginView({ initialUsername, submitting, notice, error, isLeaving, onSubmit, onSwitchServer }: LoginViewProps): JSX.Element {
  const { t } = useTranslation();
  const [username, setUsername] = React.useState(initialUsername);
  const [password, setPassword] = React.useState('');
  const [passwordVisible, setPasswordVisible] = React.useState(false);

  React.useEffect(() => {
    setUsername(initialUsername);
  }, [initialUsername]);

  return (
    <div className="login-root">
      <section
        className={`signin-card${submitting ? ' is-validating' : ''}${isLeaving ? ' is-leaving' : ''}`}
        role="region"
        aria-labelledby="admin-login-title"
      >
        <p className="signin-eyebrow">{t('login.eyebrow')}</p>
        <h2 id="admin-login-title" className="signin-title">
          {t('login.title')}
        </h2>
        <p className="signin-sub">{t('login.subtitle')}</p>

        <form
          className="signin-form"
          aria-busy={submitting}
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit({ username, password });
          }}
        >
          <div className="signin-field">
            <label className="signin-field__label" htmlFor="admin-login-user">
              {t('login.username')}
            </label>
            <div className="signin-field__wrap">
              <span className="signin-field__icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                id="admin-login-user"
                className="signin-field__input"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={submitting}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="signin-field">
            <label className="signin-field__label" htmlFor="admin-login-password">
              {t('login.password')}
            </label>
            <div className="signin-field__wrap">
              <span className="signin-field__icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                id="admin-login-password"
                className="signin-field__input"
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="signin-field__toggle"
                aria-label={passwordVisible ? t('login.hidePassword') : t('login.showPassword')}
                onClick={() => setPasswordVisible((prev) => !prev)}
              >
                {passwordVisible ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <AudioServerSwitcher variant="login" onSwitch={onSwitchServer} />

          {notice ? <p className="signin-notice">{notice}</p> : null}
          {error ? <p className="signin-error">{error}</p> : null}

          <button
            type="submit"
            className={`signin-submit${submitting ? ' is-loading' : ''}`}
            disabled={submitting}
          >
            <span>{submitting ? t('login.signingIn') : t('login.signIn')}</span>
            {!submitting ? (
              <svg className="signin-submit__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            ) : null}
          </button>
        </form>
      </section>
    </div>
  );
}
