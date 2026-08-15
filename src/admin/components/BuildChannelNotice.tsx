import React, { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import './BuildChannelNotice.css';
import type { StatusResponse } from '../types/api';

/**
 * Says out loud that this build was never meant for a real system.
 *
 * Shown for `dev` and `testing`, which are both built on every push rather than
 * cut as a release — `dev` especially, since it rebuilds on every push to the
 * branch and is the one people end up running by accident. There is no dismiss button
 * on purpose: a warning that can be cleared is a warning that gets cleared once
 * and never seen again, which is exactly the state we are trying to avoid.
 *
 * Driven by the server's declared build channel rather than by the shape of the
 * version string, so a stable release can never be mistaken for a dev build or
 * the other way round.
 */
export default function BuildChannelNotice({
  apiStatus,
}: {
  apiStatus?: StatusResponse | null;
}): JSX.Element | null {
  const { t } = useTranslation();
  const channel = apiStatus?.buildChannel;

  // Absent while the first status request is still in flight. Staying quiet until
  // it lands avoids a warning that flashes up on every load of a real release.
  if (channel !== 'dev' && channel !== 'testing') {
    return null;
  }

  const version = apiStatus?.version;

  return (
    <div className="build-notice" role="alert">
      <span className="build-notice__icon" aria-hidden="true">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <span className="build-notice__text">
        <span className="build-notice__label">{t('buildNotice.title')}</span>{' '}
        {t('buildNotice.message')}
        {version ? <code className="build-notice__tag">{version}</code> : null}
      </span>
    </div>
  );
}
