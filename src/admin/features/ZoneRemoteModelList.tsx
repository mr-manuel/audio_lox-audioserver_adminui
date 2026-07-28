import { useTranslation } from 'react-i18next';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

type ZoneRemoteModelListProps = {
  config: ZoneBeoremoteConfig | null | undefined;
  onOpenOne: () => void;
};

function RemoteGlyph(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="2" width="10" height="20" rx="3" />
      <circle cx="12" cy="7" r="1.4" />
      <line x1="9.5" y1="12" x2="14.5" y2="12" />
      <line x1="9.5" y1="15.5" x2="14.5" y2="15.5" />
    </svg>
  );
}

function Chevron(): JSX.Element {
  return (
    <svg className="zset-drill__chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * The remotes Bang & Olufsen makes, one row each.
 *
 * Every model gets its own page rather than unfolding in place: settings hanging
 * under one row while two other models sit around it read as a jumble. Only One is
 * implemented — the others are listed rather than hidden, so their absence is a
 * stated fact instead of something you wonder about, and they do not open.
 */
export default function ZoneRemoteModelList({
  config,
  onOpenOne,
}: ZoneRemoteModelListProps): JSX.Element {
  const { t } = useTranslation();
  const oneEnabled = config?.enabled === true;

  const oneSummary = oneEnabled
    ? t('zones.beoremote.summaryOn')
    : t('zones.beoremote.summaryOff');

  return (
    <div className="zset">
      <div className="zset-group">
        <div className="zset-drill is-disabled" aria-disabled="true">
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <span className="zset-drill__text">
            <span className="zset-drill__lab">{t('zones.beoremote.models.essence')}</span>
            <b className="zset-drill__sum zset-drill__sum--muted">{t('zones.beoremote.notSupported')}</b>
          </span>
        </div>

        <button type="button" className="zset-drill" onClick={onOpenOne}>
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <span className="zset-drill__text">
            <span className="zset-drill__lab">{t('zones.beoremote.models.one')}</span>
            <b className="zset-drill__sum">{oneSummary}</b>
          </span>
          <Chevron />
        </button>

        <div className="zset-drill is-disabled" aria-disabled="true">
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <span className="zset-drill__text">
            <span className="zset-drill__lab">{t('zones.beoremote.models.halo')}</span>
            <b className="zset-drill__sum zset-drill__sum--muted">{t('zones.beoremote.notSupported')}</b>
          </span>
        </div>
      </div>
    </div>
  );
}
