import { useTranslation } from 'react-i18next';
import ZoneRemotePage from './ZoneRemotePage';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

type ZoneEssenceSectionProps = {
  /** The Sendspin client this room plays through, if it has one. */
  outputClientId?: string;
  config: ZoneBeoremoteConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBeoremoteConfig | null) => void;
};

/**
 * Beoremote Essence for one zone.
 *
 * A short page on purpose. The Essence has five fixed buttons and a wheel and no display, so
 * there is no menu to fill and no key to assign — pairing it is the whole job, and that is
 * {@link ZoneRemotePage}'s. What it does is spelled out instead, because a page with a switch
 * and nothing else reads as unfinished rather than as complete.
 */
export default function ZoneEssenceSection({
  outputClientId,
  config,
  saving,
  onChange,
}: ZoneEssenceSectionProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <ZoneRemotePage
      model="essence"
      outputClientId={outputClientId}
      config={config}
      saving={saving}
      onChange={onChange}
    >
      <div className="zset-group">
        <p className="zset-group__head">{t('zones.beoremote.groupButtons')}</p>
        <p className="zset-group__empty">{t('zones.beoremote.essenceButtons')}</p>
      </div>
    </ZoneRemotePage>
  );
}
