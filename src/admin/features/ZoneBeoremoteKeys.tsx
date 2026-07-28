import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  getBeoremoteKeyOptions,
  type BeoremoteKeyBinding,
  type BeoremoteKeyOptions,
} from '../services/beoremoteApi';

type ZoneBeoremoteKeysProps = {
  zoneId: number;
  /** Bumped by the parent when a save lands, so the pickers reload their names. */
  refreshToken?: number;
  saving: boolean;
  onChange: (keys: Record<string, BeoremoteKeyBinding>) => void;
};

/**
 * Assign the coloured and dot keys on a Beoremote One.
 *
 * Which HID code belongs to which button is hardware and stays in the server; this
 * only sets what each button should do. A button left on "Default" keeps the
 * favorite in the slot it sits at, which is how it behaved before any of this was
 * configurable — so an untouched zone is unaffected.
 *
 * Every option is a real thing that exists on this zone: its own favorites, its
 * line-ins, the stations the remote could otherwise reach through the menu. There
 * is nothing to type, so nothing to mistype.
 */
export default function ZoneBeoremoteKeys({
  zoneId,
  refreshToken,
  saving,
  onChange,
}: ZoneBeoremoteKeysProps): JSX.Element {
  const { t } = useTranslation();
  const [options, setOptions] = React.useState<BeoremoteKeyOptions | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getBeoremoteKeyOptions(zoneId)
      .then((next) => {
        if (!cancelled) setOptions(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [zoneId, refreshToken]);

  /** One flat option list per button; the value encodes which kind it is. */
  function encode(binding: BeoremoteKeyBinding | undefined): string {
    if (!binding) return 'default';
    if (binding.kind === 'none') return 'none';
    if (binding.kind === 'favorite') return `favorite:${binding.slot}`;
    if (binding.kind === 'lineIn') return `linein:${binding.inputId}`;
    return `radio:${binding.audiopath}`;
  }

  function decode(value: string, radioName: string): BeoremoteKeyBinding | null {
    if (value === 'default') return null;
    if (value === 'none') return { kind: 'none' };
    const [kind, ...rest] = value.split(':');
    const arg = rest.join(':');
    if (kind === 'favorite') return { kind: 'favorite', slot: Number(arg) };
    if (kind === 'linein') return { kind: 'lineIn', inputId: arg };
    return { kind: 'radio', audiopath: arg, name: radioName || undefined };
  }

  function assign(button: string, value: string, radioName: string): void {
    if (!options) return;
    const next: Record<string, BeoremoteKeyBinding> = { ...options.bindings };
    const binding = decode(value, radioName);
    if (binding) {
      next[button] = binding;
    } else {
      // "Default" means absent, not a stored value — so the fallback keeps working
      // if the favorite behind it is later renamed or moved.
      delete next[button];
    }
    setOptions({ ...options, bindings: next });
    onChange(next);
  }

  if (failed) {
    return <p className="zset-note">{t('zones.beoremote.keysFailed')}</p>;
  }
  if (!options) {
    return <p className="zset-note">{t('zones.beoremote.keysLoading')}</p>;
  }

  return (
    <div className="zset-group">
      <p className="zset-group__head">{t('zones.beoremote.keysTitle')}</p>
      <p className="zset-note">{t('zones.beoremote.keysCopy')}</p>
      {options.buttons.map((entry) => {
        const value = encode(options.bindings[entry.button]);
        const fallback = options.favorites.find((fav) => fav.slot === entry.defaultSlot);
        return (
          <div className="zset-row" key={entry.button}>
            <span className={`beokey beokey--${entry.button}`} aria-hidden="true" />
            <div className="zset-row__text">
              <span className="zset-row__title">
                {t(`zones.beoremote.button.${entry.button}`, { defaultValue: entry.button })}
              </span>
              <span className="zset-row__desc">
                {fallback
                  ? t('zones.beoremote.keyDefaultIs', { name: fallback.name })
                  : t('zones.beoremote.keyDefaultEmpty')}
              </span>
            </div>
            <select
              className="zones-hub__select"
              value={value}
              disabled={saving}
              aria-label={t(`zones.beoremote.button.${entry.button}`, { defaultValue: entry.button })}
              onChange={(event) => {
                const picked = event.target.value;
                const radio = options.radios.find((r) => `radio:${r.audiopath}` === picked);
                assign(entry.button, picked, radio?.name ?? '');
              }}
            >
              <option value="default">{t('zones.beoremote.keyDefault')}</option>
              <option value="none">{t('zones.beoremote.keyNone')}</option>
              {options.favorites.length > 0 && (
                <optgroup label={t('zones.beoremote.groupFavorites')}>
                  {options.favorites.map((fav) => (
                    <option key={`f${fav.slot}`} value={`favorite:${fav.slot}`}>
                      {fav.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {options.lineIns.length > 0 && (
                <optgroup label={t('zones.beoremote.groupLineIns')}>
                  {options.lineIns.map((input) => (
                    <option key={input.id} value={`linein:${input.id}`}>
                      {input.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {options.radios.length > 0 && (
                <optgroup label={t('zones.beoremote.groupRadio')}>
                  {options.radios.map((station) => (
                    <option key={station.audiopath} value={`radio:${station.audiopath}`}>
                      {station.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        );
      })}
    </div>
  );
}
