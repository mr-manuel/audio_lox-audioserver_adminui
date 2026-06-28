import React, { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import './Hero.css';
import { fetchStatus, StatusResponse } from '../services/statusApi';
import { usePolling } from '../hooks/usePolling';
import { formatUptime } from '../utils/format';
import { useGlobalAlert } from './GlobalAlert';

type StatusTone = 'success' | 'warn' | 'error' | 'muted';

export default function Hero(): JSX.Element {
  const { t } = useTranslation();
  const [info, setInfo] = React.useState<StatusResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { push: pushAlert } = useGlobalAlert();
  const lastPushedErrorRef = React.useRef<string | null>(null);

  const pollStatus = React.useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const status = await fetchStatus(signal);
      if (signal?.aborted) return;
      setInfo(status);
      setError(null);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  usePolling(pollStatus, { delay: 5000 });

  React.useEffect(() => {
    if (!error) {
      lastPushedErrorRef.current = null;
      return;
    }
    if (lastPushedErrorRef.current === error) return;
    lastPushedErrorRef.current = error;
    pushAlert({ tone: 'error', title: t('hero.status.errorTitle'), message: error });
  }, [error, pushAlert, t]);

  const status = React.useMemo((): { label: string; tone: StatusTone } => {
    if (error) return { label: t('hero.status.unavailable'), tone: 'error' };
    if (!info) return { label: t('hero.status.connecting'), tone: 'warn' };
    if (info.paired) return { label: t('hero.status.paired'), tone: 'success' };
    return { label: t('hero.status.unpaired'), tone: 'warn' };
  }, [error, info, t]);

  const uptime = formatUptime(info?.uptime);
  const zoneCount = typeof info?.zones === 'number' ? info.zones : null;
  const firmwareVersion = info?.firmwareVersion ?? '';
  const firmwareDisplay = firmwareVersion.includes('LWSS V ')
    ? firmwareVersion.split('LWSS V ')[1].trim()
    : firmwareVersion;
  const apiVersionRaw = info?.apiVersion ?? '';
  const apiDisplay = apiVersionRaw.includes('API:')
    ? apiVersionRaw.split('API:')[1].replace(/[^0-9.]/g, '')
    : apiVersionRaw.replace(/[^0-9.]/g, '');

  return (
    <section className="hero-content">
      <div className="hero-mark" aria-hidden="true">
        <svg width="64" height="46" viewBox="8 12 84 60">
          <path
            className="hero-mark-peak"
            d="M14 46 L50 18 L86 46"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <g fill="currentColor">
            <rect x="20" y="63.1" width="2.17" height="5.78" rx="1.08" opacity="0.4" />
            <rect x="25.78" y="59.5" width="2.17" height="13.01" rx="1.08" opacity="0.6" />
            <rect x="31.57" y="61.66" width="2.17" height="8.67" rx="1.08" opacity="0.8" />
            <rect x="37.35" y="58.05" width="2.17" height="15.9" rx="1.08" />
            <rect x="46.03" y="56.6" width="2.89" height="18.8" rx="1.45" />
            <rect x="54.69" y="58.05" width="2.17" height="15.9" rx="1.08" />
            <rect x="60.48" y="60.94" width="2.17" height="10.12" rx="1.08" opacity="0.9" />
            <rect x="66.26" y="58.77" width="2.17" height="14.46" rx="1.08" opacity="0.8" />
            <rect x="72.05" y="62.38" width="2.17" height="7.23" rx="1.08" opacity="0.7" />
            <rect x="77.83" y="63.83" width="2.17" height="4.34" rx="1.08" opacity="0.6" />
          </g>
        </svg>
      </div>

      <h1 className="hero-wordmark" aria-label="sonn core">
        <span className="hero-wordmark__sonn">sonn</span>
        <span className="hero-wordmark__core">core</span>
      </h1>
      <p className="hero-tagline">{t('hero.tagline')}</p>

      <div className="diag-strip">
        <div className="diag-item">
          <span className={`pulse-dot${status.tone === 'warn' ? ' pulse-dot--warn' : ''}${status.tone === 'error' ? ' pulse-dot--error' : ''}`} />
          <span className={`diag-value diag-value--${status.tone}`}>{status.label}</span>
        </div>
        {uptime ? (
          <div className="diag-item">
            <span className="diag-label">{t('hero.labels.uptime')}</span>
            <span className="diag-value">{uptime}</span>
          </div>
        ) : null}
        {zoneCount !== null ? (
          <div className="diag-item">
            <span className="diag-label">{t('hero.labels.zones')}</span>
            <span className="diag-value">{zoneCount}</span>
          </div>
        ) : null}
        {firmwareDisplay ? (
          <div className="diag-item">
            <span className="diag-label">{t('hero.labels.fw')}</span>
            <span className="diag-value">{firmwareDisplay}</span>
          </div>
        ) : null}
        {apiDisplay ? (
          <div className="diag-item">
            <span className="diag-label">{t('hero.labels.api')}</span>
            <span className="diag-value">{apiDisplay}</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
