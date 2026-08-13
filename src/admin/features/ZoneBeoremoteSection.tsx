import { useTranslation } from 'react-i18next';
import ZoneBeoremoteKeys from './ZoneBeoremoteKeys';
import ZoneRemotePage from './ZoneRemotePage';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

/** The submenu choices a zone can pick. The remote's firmware allows exactly one. */
type SubmenuKind = 'none' | 'radio' | 'favorites';

type ZoneBeoremoteSectionProps = {
  zoneId: number;
  /** The Sendspin client this room plays through, if it has one. */
  outputClientId?: string;
  config: ZoneBeoremoteConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBeoremoteConfig | null) => void;
};

/**
 * Beoremote One for one zone.
 *
 * The switch, which speaker's radio it uses and pairing belong to every remote and live in
 * {@link ZoneRemotePage}. What is left here is what only a One can be asked: it has a display,
 * so there is a menu to fill, and eight assignable keys.
 *
 * The remote's screen is narrow and its firmware allows a single sub-list, so the only real
 * choice about the menu is what goes in that list. Everything else (order, length, shortened
 * names) the server decides.
 */
export default function ZoneBeoremoteSection({
  zoneId,
  outputClientId,
  config,
  saving,
  onChange,
}: ZoneBeoremoteSectionProps): JSX.Element {
  const { t } = useTranslation();
  const enabled = config?.enabled === true;

  const submenuKind: SubmenuKind = config?.submenuSource?.kind === 'radio'
    ? 'radio'
    : config?.submenuSource?.kind === 'favorites'
      ? 'favorites'
      : 'none';

  function update(patch: Partial<ZoneBeoremoteConfig>): void {
    onChange({ enabled, ...(config ?? {}), ...patch });
  }

  function changeSubmenu(kind: SubmenuKind): void {
    update({ submenuSource: kind === 'none' ? null : { kind } });
  }

  return (
    <ZoneRemotePage
      model="one"
      outputClientId={outputClientId}
      config={config}
      saving={saving}
      onChange={onChange}
    >
      {/* What the remote's own screen lists. */}
      <div className="zset-group">
        <p className="zset-group__head">{t('zones.beoremote.groupMenu')}</p>
        <div className="zset-row">
          <div className="zset-row__text">
            <span className="zset-row__title">{t('zones.beoremote.lineInsTitle')}</span>
            <span className="zset-row__desc">{t('zones.beoremote.lineInsCopy')}</span>
          </div>
          <button
            type="button"
            className={`zones-hub__toggle${config?.includeLineIns !== false ? ' is-on' : ''}`}
            aria-label={t('zones.beoremote.lineInsTitle')}
            aria-pressed={config?.includeLineIns !== false}
            disabled={saving}
            onClick={() => update({ includeLineIns: config?.includeLineIns === false })}
          />
        </div>

        <div className="zset-row">
          <div className="zset-row__text">
            <span className="zset-row__title">{t('zones.beoremote.submenuTitle')}</span>
            <span className="zset-row__desc">{t('zones.beoremote.submenuCopy')}</span>
          </div>
          {/* A plain select, like the state-controller row: SelectMenu is width:100%
              and would squeeze the label column to nothing in a flex row. */}
          <select
            className="zones-hub__select"
            value={submenuKind}
            disabled={saving}
            aria-label={t('zones.beoremote.submenuTitle')}
            onChange={(event) => changeSubmenu(event.target.value as SubmenuKind)}
          >
            <option value="none">{t('zones.beoremote.submenuNone')}</option>
            <option value="radio">{t('zones.beoremote.submenuRadio')}</option>
            <option value="favorites">{t('zones.beoremote.submenuFavorites')}</option>
          </select>
        </div>
      </div>

      {/* The buttons get their own group and stay open: on a page of their own
          there is room, and hiding them behind a second disclosure was the
          thing that made this hard to use. */}
      <ZoneBeoremoteKeys
        zoneId={zoneId}
        saving={saving}
        onChange={(keys) => update({ keys })}
      />
    </ZoneRemotePage>
  );
}
