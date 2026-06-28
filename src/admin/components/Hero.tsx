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
        <svg width="76" height="28" viewBox="0 0 88 32">
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
      </div>

      <h1 className="hero-wordmark">{t('hero.appTitle')}</h1>
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
