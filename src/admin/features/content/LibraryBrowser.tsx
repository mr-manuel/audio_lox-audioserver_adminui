import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteLibraryAlbum,
  deleteLibraryArtist,
  deleteLibraryTrack,
  fetchLibraryBrowse,
} from '../../services/contentApi';
import type { LibraryBrowseItem, LibraryBrowseKind } from '../../services/contentApi';
import { useConfirm } from '../../components/ConfirmDialog';
import SearchInput from '../../components/SearchInput';
import './LibraryBrowser.css';

const KINDS: LibraryBrowseKind[] = ['albums', 'artists', 'tracks'];
const PAGE_SIZE = 50;

/** Identity used for selection and for the delete call — tracks delete by audiopath. */
function itemKey(item: LibraryBrowseItem, kind: LibraryBrowseKind): string {
  return kind === 'tracks' ? (item.audiopath ?? item.id) : item.id;
}

function formatDuration(seconds?: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type LibraryBrowserProps = {
  storageId: string;
  /** Bumped by the parent after a rescan/upload so the listing refetches. */
  refreshToken?: number;
  /** A network share can't be uploaded to, so its empty state differs. */
  isShare?: boolean;
  onMutated?: () => void;
};

export default function LibraryBrowser({
  storageId,
  refreshToken = 0,
  isShare = false,
  onMutated,
}: LibraryBrowserProps): JSX.Element {
  const { t } = useTranslation();
  const { confirm } = useConfirm();

  const [kind, setKind] = React.useState<LibraryBrowseKind>('albums');
  const [rawQuery, setRawQuery] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(0);

  const [items, setItems] = React.useState<LibraryBrowseItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [localRefresh, setLocalRefresh] = React.useState(0);

  // Debounce typing so each keystroke doesn't hit the server.
  React.useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(rawQuery.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [rawQuery]);

  // Switching tab or share invalidates both the page and the selection, since
  // ids from one listing mean nothing in another.
  React.useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [kind, storageId]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchLibraryBrowse({ kind, storageId, query, offset: page * PAGE_SIZE, limit: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setTotal(res.total ?? 0);
        setTruncated(Boolean(res.truncated));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setTotal(0);
        setError(err instanceof Error ? err.message : t('content.library.browser.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, storageId, query, page, refreshToken, localRefresh, t]);

  const pageCount = query ? 1 : Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(itemKey(i, kind)));

  const toggleOne = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllOnPage = (): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      const keys = items.map((i) => itemKey(i, kind));
      if (allOnPageSelected) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  };

  /**
   * Deletion removes the audio files from disk, so the dialog states the real
   * scope: how many rows and — where the listing knows it — how many tracks.
   */
  const handleDelete = async (): Promise<void> => {
    const targets = items.filter((i) => selected.has(itemKey(i, kind)));
    if (targets.length === 0) return;

    const trackTotal = targets.reduce((sum, i) => sum + (kind === 'tracks' ? 1 : (i.items ?? 0)), 0);
    const scope = t(`content.library.browser.scope.${kind}`, { count: targets.length });
    const ok = await confirm({
      title: t('content.library.browser.confirmTitle'),
      message: t('content.library.browser.confirmMessage', { scope, count: trackTotal }),
      confirmLabel: t('content.library.browser.confirmDelete'),
      tone: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    let failed = 0;
    for (const item of targets) {
      try {
        if (kind === 'albums') await deleteLibraryAlbum(item.id);
        else if (kind === 'artists') await deleteLibraryArtist(item.id);
        else await deleteLibraryTrack(item.audiopath ?? item.id);
      } catch {
        failed += 1;
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (failed > 0) setError(t('content.library.browser.deleteFailed', { count: failed }));
    // Deleting shifts everything after it; step back if the page is now past the end.
    if (page > 0 && targets.length >= items.length) setPage((p) => Math.max(0, p - 1));
    else setLocalRefresh((v) => v + 1);
    onMutated?.();
  };

  const selectedCount = selected.size;

  return (
    <div className="library-browser">
      <div className="library-browser__bar">
        <div className="library-browser__kinds" role="tablist" aria-label={t('content.library.browser.aria')}>
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`chip chip--filter${kind === k ? ' is-active' : ''}`}
              onClick={() => setKind(k)}
            >
              {t(`content.library.browser.kind.${k}`)}
            </button>
          ))}
        </div>
        <SearchInput
          value={rawQuery}
          onChange={setRawQuery}
          placeholder={t(`content.library.browser.searchPlaceholder.${kind}`)}
          ariaLabel={t(`content.library.browser.searchPlaceholder.${kind}`)}
          reset={
            rawQuery
              ? { onClick: () => setRawQuery(''), ariaLabel: t('content.library.browser.clearSearch') }
              : undefined
          }
        />
      </div>

      {selectedCount > 0 ? (
        <div className="library-browser__selection">
          <span className="library-browser__selection-count">
            {t('content.library.browser.selected', { count: selectedCount })}
          </span>
          <button
            type="button"
            className="content-btn content-btn--sm"
            onClick={() => setSelected(new Set())}
            disabled={busy}
          >
            {t('content.library.browser.clearSelection')}
          </button>
          <button
            type="button"
            className="content-btn content-btn--sm content-btn--danger"
            onClick={() => void handleDelete()}
            disabled={busy}
          >
            {busy ? t('content.library.browser.deleting') : t('content.library.browser.deleteSelected')}
          </button>
        </div>
      ) : null}

      {error ? <div className="library-browser__error">{error}</div> : null}

      {loading ? (
        <div className="library-browser__state">{t('content.library.browser.loading')}</div>
      ) : items.length === 0 ? (
        <div className="library-browser__state">
          {query
            ? t('content.library.browser.noMatches', { query })
            : isShare
              ? t('content.library.browser.emptyShare')
              : t('content.library.browser.empty')}
        </div>
      ) : (
        <>
          <div className="library-browser__head">
            <label className="library-browser__check">
              <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} />
              <span>{t('content.library.browser.selectAll')}</span>
            </label>
            <span className="library-browser__count">
              {query
                ? t('content.library.browser.matches', { count: total })
                : t(`content.library.browser.totalOf.${kind}`, { count: total })}
              {truncated ? ` · ${t('content.library.browser.truncated')}` : ''}
            </span>
          </div>

          <ul className="library-browser__list">
            {items.map((item) => {
              const key = itemKey(item, kind);
              const isSelected = selected.has(key);
              const initial = (item.name || '?').charAt(0).toUpperCase();
              const secondary =
                kind === 'tracks'
                  ? [item.artist, item.album].filter(Boolean).join(' · ')
                  : t('content.library.browser.trackCount', { count: item.items ?? 0 });
              return (
                <li key={key} className={`library-browser__row${isSelected ? ' is-selected' : ''}`}>
                  <label className="library-browser__row-check">
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(key)} />
                  </label>
                  <div className={`library-browser__art${kind === 'artists' ? ' is-round' : ''}`}>
                    {item.coverurl ? (
                      <img src={item.coverurl} alt="" loading="lazy" />
                    ) : (
                      <span className="library-browser__art-initial">{initial}</span>
                    )}
                  </div>
                  <div className="library-browser__main">
                    <div className="library-browser__name" title={item.name}>
                      {item.name}
                    </div>
                    {secondary ? <div className="library-browser__meta">{secondary}</div> : null}
                  </div>
                  {kind === 'tracks' && item.duration ? (
                    <span className="library-browser__duration">{formatDuration(item.duration)}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {pageCount > 1 ? (
            <div className="library-browser__pager">
              <button
                type="button"
                className="content-btn content-btn--sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                {t('content.library.browser.prev')}
              </button>
              <span className="library-browser__pager-label">
                {t('content.library.browser.pageOf', { page: page + 1, pages: pageCount })}
              </span>
              <button
                type="button"
                className="content-btn content-btn--sm"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={page >= pageCount - 1}
              >
                {t('content.library.browser.next')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
