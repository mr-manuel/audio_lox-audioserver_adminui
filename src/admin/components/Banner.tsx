import React from 'react';
import './Banner.css';

export type BannerTone = 'info' | 'warn' | 'error';

export type BannerAction = {
  label: string;
  onClick: () => void;
  primary?: boolean;
};

export type BannerProps = {
  tone?: BannerTone;
  title: string;
  message?: React.ReactNode;
  actions?: BannerAction[];
  onDismiss?: () => void;
};

function BannerIcon({ tone }: { tone: BannerTone }): JSX.Element {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (tone === 'warn') {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  if (tone === 'error') {
    return (
      <svg {...common} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function Banner({ tone = 'info', title, message, actions, onDismiss }: BannerProps): JSX.Element {
  return (
    <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="banner__icon" aria-hidden="true">
        <BannerIcon tone={tone} />
      </div>
      <div className="banner__body">
        <div className="banner__title">{title}</div>
        {message ? <div className="banner__message">{message}</div> : null}
      </div>
      {actions && actions.length ? (
        <div className="banner__actions">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`banner__btn${action.primary ? ' is-primary' : ''}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className="banner__close"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export default Banner;
