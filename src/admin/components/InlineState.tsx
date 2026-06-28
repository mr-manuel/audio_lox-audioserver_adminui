import React from 'react';
import './InlineState.css';

export type InlineStateTone = 'subtle' | 'info' | 'warn' | 'error' | 'success';
export type InlineStateKind = 'loading' | 'empty' | 'info' | 'error' | 'success';

type InlineStateAction = {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
};

type InlineStateProps = {
  kind: InlineStateKind;
  title: string;
  message?: React.ReactNode;
  tone?: InlineStateTone;
  compact?: boolean;
  action?: InlineStateAction;
  secondaryAction?: InlineStateAction;
  className?: string;
};

function InfoIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm0 4.6a1.4 1.4 0 11-1.4 1.4A1.4 1.4 0 0112 6.6zm1.6 12H10.8v-2h.8v-4h-.8v-2h2.8v6h.8z"
      />
    </svg>
  );
}

function WarningIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2V10z"
      />
    </svg>
  );
}

function ErrorIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"
      />
    </svg>
  );
}

function SuccessIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 1010 10A10 10 0 0012 2zm-1.2 14.4L6 11.6l1.4-1.4 3.4 3.4 6.8-6.8L19 8.2z"
      />
    </svg>
  );
}

function iconFor(kind: InlineStateKind): React.ReactNode {
  if (kind === 'loading') return <span className="inline-state__spinner" aria-hidden="true" />;
  if (kind === 'error') return <ErrorIcon />;
  if (kind === 'success') return <SuccessIcon />;
  if (kind === 'empty') return <InfoIcon />;
  return <WarningIcon />;
}

export default function InlineState({
  kind,
  title,
  message,
  tone,
  compact = false,
  action,
  secondaryAction,
  className,
}: InlineStateProps): JSX.Element {
  const effectiveTone: InlineStateTone =
    tone ?? (kind === 'error' ? 'error' : kind === 'loading' ? 'subtle' : kind === 'success' ? 'success' : 'subtle');

  const role = kind === 'error' ? 'alert' : 'status';
  const ariaLive = kind === 'error' ? 'assertive' : 'polite';

  const classForAction = (variant?: InlineStateAction['variant']): string => {
    if (variant === 'primary') return 'btn btn--primary btn--compact';
    return 'btn btn--secondary btn--compact';
  };

  return (
    <div
      className={[
        'inline-state',
        `inline-state--${effectiveTone}`,
        compact ? 'inline-state--compact' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={role}
      aria-live={ariaLive}
    >
      <div className="inline-state__icon">{iconFor(kind)}</div>
      <div className="inline-state__body">
        <p className="inline-state__title">{title}</p>
        {message ? <p className="inline-state__message">{message}</p> : null}
        {(action || secondaryAction) && (
          <div className="inline-state__actions">
            {action ? (
              <button type="button" className={classForAction(action.variant)} onClick={action.onClick}>
                {action.label}
              </button>
            ) : null}
            {secondaryAction ? (
              <button
                type="button"
                className={classForAction(secondaryAction.variant)}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
