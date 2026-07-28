import React from 'react';
import { useTranslation } from 'react-i18next';
import ZoneBeoremoteKeys from './ZoneBeoremoteKeys';
import { getBeoremoteBridges, type BeoremoteBridge } from '../services/beoremoteApi';
import type { ZoneBeoremoteConfig } from '@/domain/config/types';

/** The submenu choices a zone can pick. The remote's firmware allows exactly one. */
type SubmenuKind = 'none' | 'radio' | 'favorites';

type ZoneBeoremoteSectionProps = {
  zoneId: number;
  config: ZoneBeoremoteConfig | null | undefined;
  saving: boolean;
  onChange: (next: ZoneBeoremoteConfig | null) => void;
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

/**
 * Beoremote One for one zone.
 *
 * A Bang & Olufsen remote is Bluetooth, so it reaches the server through a small
 * bridge that pairs with it. The zone picks which bridge drives it — that way the
 * remote belongs to the room, the same as its AirPlay or Spotify receiver.
 *
 * The remote's screen is narrow and its firmware allows a single sub-list, so the
 * only real choice here is what goes in that list. Everything else about the menu
 * (order, length, shortened names) the server decides.
 */
export default function ZoneBeoremoteSection({
  zoneId,
  config,
  saving,
  onChange,
}: ZoneBeoremoteSectionProps): JSX.Element {
  const { t } = useTranslation();
  const enabled = config?.enabled === true;
  const selectedBridgeId = config?.bridgeId ?? '';
  const submenuKind: SubmenuKind = config?.submenuSource?.kind === 'radio'
    ? 'radio'
    : config?.submenuSource?.kind === 'favorites'
      ? 'favorites'
      : 'none';

  const [bridges, setBridges] = React.useState<BeoremoteBridge[] | null>(null);
  const [loadFailed, setLoadFailed] = React.useState(false);

  const loadBridges = React.useCallback(async (): Promise<void> => {
    setLoadFailed(false);
    try {
      setBridges(await getBeoremoteBridges());
    } catch {
      setBridges([]);
      setLoadFailed(true);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    void loadBridges();
  }, [enabled, loadBridges]);

  function update(patch: Partial<ZoneBeoremoteConfig>): void {
    onChange({ enabled, ...(config ?? {}), ...patch });
  }

  function toggle(next: boolean): void {
    // Turning it off drops the whole block rather than leaving a disabled remnant
    // that would still claim its bridge.
    onChange(next ? { ...(config ?? {}), enabled: true } : null);
  }

  function changeSubmenu(kind: SubmenuKind): void {
    update({ submenuSource: kind === 'none' ? null : { kind } });
  }

  /**
   * The line under the picker carries what the chip used to: whether the chosen
   * remote is actually answering, and why the list might be empty.
   */
  function describeSelectedBridge(): string {
    if (bridges === null) {
      return t('zones.beoremote.loading');
    }
    if (loadFailed) {
      return t('zones.beoremote.loadFailed');
    }
    if (bridges.length === 0) {
      return t('zones.beoremote.noBridges');
    }
    const selected = bridges.find((bridge) => bridge.bridge_id === selectedBridgeId);
    if (!selected) {
      return t('zones.beoremote.pickPrompt');
    }
    return selected.connected
      ? t('zones.beoremote.connectedSince', { mac: selected.remote_mac || selected.bridge_id })
      : t('zones.beoremote.offlineHint');
  }

  return (
    <div className="zset">
      {/* This page is about one model, so it leads with its own on/off and then the
          settings that only exist while it is on. */}
      <div className="zset-group">
        <div className="zset-row">
          <span className="zset-row__icon" aria-hidden="true">
            <RemoteGlyph />
          </span>
          <div className="zset-row__text">
            <span className="zset-row__title">{t('zones.beoremote.useTitle')}</span>
            <span className="zset-row__desc">{t('zones.beoremote.copy')}</span>
          </div>
          <button
            type="button"
            className={`zones-hub__toggle${enabled ? ' is-on' : ''}`}
            aria-label={t('zones.beoremote.useTitle')}
            aria-pressed={enabled}
            disabled={saving}
            onClick={() => toggle(!enabled)}
          />
        </div>

        {enabled && (
          <div className="zset-row">
            <div className="zset-row__text">
              <span className="zset-row__title">{t('zones.beoremote.pickTitle')}</span>
              <span className="zset-row__desc">{describeSelectedBridge()}</span>
            </div>
            <select
              className="zones-hub__select"
              value={selectedBridgeId}
              disabled={saving || !bridges?.length}
              aria-label={t('zones.beoremote.pickTitle')}
              onChange={(event) => update({ bridgeId: event.target.value })}
            >
              <option value="">{t('zones.beoremote.pickNone')}</option>
              {(bridges ?? []).map((bridge) => {
                // A bridge another room already uses would be driven from two places.
                const claimedElsewhere =
                  bridge.assigned_zone_id !== null && bridge.assigned_zone_id !== zoneId;
                return (
                  <option key={bridge.bridge_id} value={bridge.bridge_id} disabled={claimedElsewhere}>
                    {(bridge.hostname || bridge.bridge_id) +
                      (claimedElsewhere ? ` — ${t('zones.beoremote.inUse')}` : '')}
                  </option>
                );
              })}
            </select>
          </div>
        )}
      </div>

      {enabled && (
        <>
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
        </>
      )}
    </div>
  );
}
