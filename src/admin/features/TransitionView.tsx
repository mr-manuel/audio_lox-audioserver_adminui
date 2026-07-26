import React from 'react';
import { useTranslation } from 'react-i18next';

export type TransitionReason = 'reset' | 'switch';

// Shown while the server bounces — after a config wipe ('reset') or an in-place
// deployment-mode switch ('switch'). Reuses the pairing screen's calm card shell;
// the animated status dot signals work-in-progress. When the server answers again,
// App resolves to the next view (welcome, pairing, or the shell).
export default function TransitionView({ reason }: { reason: TransitionReason }): JSX.Element {
  const { t } = useTranslation();
  const key = reason === 'switch' ? 'transition.switch' : 'transition.reset';

  return (
    <div className="pairing-root">
      <section className="pairing-card" aria-labelledby="transition-title" aria-busy="true">
        <p className="pairing-eyebrow">{t(`${key}.eyebrow`)}</p>
        <h2 id="transition-title" className="pairing-title">
          {t(`${key}.title`)}
        </h2>
        <p className="pairing-sub">{t(`${key}.subtitle`)}</p>

        <div className="pairing-status">
          <span className="pairing-status__dot" aria-hidden="true" />
          <div className="pairing-status__text">
            <div className="pairing-status__title">{t(`${key}.statusTitle`)}</div>
            <div className="pairing-status__sub">{t(`${key}.statusSub`)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
