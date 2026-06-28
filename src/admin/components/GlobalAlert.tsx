import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import './GlobalAlert.css';

export type AlertTone = 'success' | 'error' | 'warn' | 'info';

export type AlertAction = {
  label: string;
  onClick: () => void;
};

type AlertPayload = {
  id: number;
  tone: AlertTone;
  title?: string;
  message: string;
  action?: AlertAction;
  hiding?: boolean;
};

type PushArg = {
  tone?: AlertTone;
  type?: 'success' | 'error';
  title?: string;
  message: string;
  action?: AlertAction;
};

type GlobalAlertContextValue = {
  push: (alert: PushArg) => void;
};

const GlobalAlertContext = React.createContext<GlobalAlertContextValue | null>(null);
const ALERT_TIMEOUT_MS = 5000;
const EXIT_MS = 250;

function ToneIcon({ tone }: { tone: AlertTone }): JSX.Element {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  if (tone === 'success') {
    return (
      <svg {...common} strokeWidth={2.5} aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (tone === 'error') {
    return (
      <svg {...common} strokeWidth={2} aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    );
  }
  if (tone === 'warn') {
    return (
      <svg {...common} strokeWidth={2} aria-hidden="true">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    );
  }
  return (
    <svg {...common} strokeWidth={2} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

export function GlobalAlertProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { t } = useTranslation();
  const [alerts, setAlerts] = React.useState<AlertPayload[]>([]);
  const counterRef = React.useRef(0);
  const timersRef = React.useRef<Map<number, number>>(new Map());

  const dismiss = React.useCallback((id: number): void => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, hiding: true } : a)));
    window.setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    }, EXIT_MS);
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = React.useCallback(
    (payload: PushArg): void => {
      const id = ++counterRef.current;
      const tone = payload.tone ?? payload.type ?? 'info';
      const next: AlertPayload = {
        id,
        tone,
        title: payload.title,
        message: payload.message,
        action: payload.action,
      };
      setAlerts((prev) => [...prev, next]);
      const timer = window.setTimeout(() => dismiss(id), ALERT_TIMEOUT_MS);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  React.useEffect(
    () => () => {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
    },
    [],
  );

  const portal = (
    <div className="toast-stack" role="region" aria-live="polite" aria-atomic="false">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`toast toast--${alert.tone}${alert.hiding ? ' is-leaving' : ''}`}
          role={alert.tone === 'error' ? 'alert' : 'status'}
        >
          <div className="toast__icon" aria-hidden="true">
            <ToneIcon tone={alert.tone} />
          </div>
          <div className="toast__body">
            {alert.title ? <div className="toast__title">{alert.title}</div> : null}
            <div className="toast__message">{alert.message}</div>
            {alert.action ? (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  alert.action?.onClick();
                  dismiss(alert.id);
                }}
              >
                {alert.action.label} →
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="toast__close"
            aria-label={t('alert.dismiss')}
            onClick={() => dismiss(alert.id)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );

  return (
    <GlobalAlertContext.Provider value={{ push }}>
      {typeof document !== 'undefined' ? createPortal(portal, document.body) : null}
      {children}
    </GlobalAlertContext.Provider>
  );
}

export function useGlobalAlert(): GlobalAlertContextValue {
  const ctx = React.useContext(GlobalAlertContext);
  if (!ctx) {
    throw new Error('useGlobalAlert must be used within GlobalAlertProvider');
  }
  return ctx;
}
