import React from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusResponse } from '../types/api';

type PairingViewProps = {
  status: StatusResponse | null;
};

export default function PairingView({ status }: PairingViewProps): JSX.Element {
  const { t } = useTranslation();
  const serialLabel = status?.serial ?? '—';
  const hostLabel = typeof window !== 'undefined' ? window.location.host || '—' : '—';

  return (
    <div className="pairing-root">
      <section className="pairing-card" aria-labelledby="pairing-title">
        <p className="pairing-eyebrow">{t('pairing.eyebrow')}</p>
        <h2 id="pairing-title" className="pairing-title">
          {t('pairing.title')}
        </h2>
        <p className="pairing-sub">{t('pairing.subtitle')}</p>

        <div className="pairing-status">
          <span className="pairing-status__dot" aria-hidden="true" />
          <div className="pairing-status__text">
            <div className="pairing-status__title">{t('pairing.statusTitle')}</div>
            <div className="pairing-status__sub">
              {t('pairing.statusSub')}
            </div>
          </div>
        </div>

        <p className="pairing-steps-label">{t('pairing.stepsLabel')}</p>
        <ol className="pairing-steps">
          <li>
            <div className="pairing-step__body">
              <div className="pairing-step__main">{t('pairing.step1')}</div>
              <div className="pairing-step__sub">
                {t('pairing.step1Serial')} <span className="pairing-step__mono">{serialLabel}</span>
                <span className="pairing-step__sep">·</span>
                {t('pairing.step1Host')} <span className="pairing-step__mono">{hostLabel}</span>
              </div>
            </div>
          </li>
          <li>
            <div className="pairing-step__body">
              <div className="pairing-step__main">
                {t('pairing.step2')}
              </div>
            </div>
          </li>
          <li>
            <div className="pairing-step__body">
              <div className="pairing-step__main">{t('pairing.step3')}</div>
            </div>
          </li>
        </ol>
      </section>
    </div>
  );
}
