import React from 'react';
import type { StatusResponse } from '../types/api';
import {
  EMPTY_LATEST,
  type LatestVersions,
  computeHasUpdates,
  fetchLatestVersions,
  readCachedCheck,
  writeCachedCheck,
} from '../services/updateCheck';

// How often the shell re-polls the backend for update availability while open,
// so the "updates available" chip appears without a page refresh. The poll hits
// our own backend (cheap, server-cached) — the upstream GitHub/npm cadence is
// bounded server-side, not here.
const POLL_INTERVAL_MS = 60_000;

type UpdateCheckValue = {
  latest: LatestVersions;
  checking: boolean;
  checkedAt: string | null;
  hasUpdates: boolean;
  /** Re-run the check. Skips the network when a fresh cache exists unless forced.
   *  Resolves false when a forced check failed (so callers can surface a toast). */
  recheck: (opts?: { force?: boolean }) => Promise<boolean>;
  /** Optimistically reflect a just-installed component version in-memory (not
   *  persisted) so its row clears immediately after an update, ahead of the
   *  next status poll / background re-check. */
  patchComponentLatest: (name: string, version: string) => void;
  /** Set when the user clicks the shell's "updates available" chip, so SetupView
   *  opens its Updates sub-tab even if it is mounting fresh from another tab. */
  pendingUpdatesFocus: boolean;
  requestUpdatesFocus: () => void;
  clearUpdatesFocus: () => void;
};

const UpdateCheckContext = React.createContext<UpdateCheckValue | null>(null);

export function useUpdateCheck(): UpdateCheckValue {
  const ctx = React.useContext(UpdateCheckContext);
  if (!ctx) {
    throw new Error('useUpdateCheck must be used within an UpdateCheckProvider');
  }
  return ctx;
}

type ProviderProps = {
  status: StatusResponse | null;
  /** Only auto-check (and surface results) once the admin shell is active. */
  enabled: boolean;
  children: React.ReactNode;
};

export function UpdateCheckProvider({ status, enabled, children }: ProviderProps): JSX.Element {
  const cached = React.useRef(readCachedCheck()).current;
  const [latest, setLatest] = React.useState<LatestVersions>(cached?.latest ?? EMPTY_LATEST);
  const [checkedAt, setCheckedAt] = React.useState<string | null>(cached?.checkedAt ?? null);
  const [checking, setChecking] = React.useState(false);
  const [pendingUpdatesFocus, setPendingUpdatesFocus] = React.useState(false);
  const checkingRef = React.useRef(false);
  // Serialized last result, so silent 60s polls only re-render when data changed.
  const lastSerialized = React.useRef(JSON.stringify(cached?.latest ?? EMPTY_LATEST));

  const recheck = React.useCallback(
    async (opts?: { force?: boolean; silent?: boolean }): Promise<boolean> => {
      if (checkingRef.current) return false;
      checkingRef.current = true;
      // Background polls stay silent so the manual "check" button doesn't flicker
      // to its spinner every minute; only explicit checks toggle the visible state.
      if (!opts?.silent) setChecking(true);
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 8000);
      try {
        const next = await fetchLatestVersions(controller.signal, { force: opts?.force });
        const at = new Date().toISOString();
        const serialized = JSON.stringify(next);
        const changed = serialized !== lastSerialized.current;
        if (changed) {
          lastSerialized.current = serialized;
          setLatest(next);
          writeCachedCheck(next, at);
        }
        // Always refresh the timestamp on an explicit check (so the user sees
        // "checked just now"); on silent polls only when something changed.
        if (changed || !opts?.silent) {
          setCheckedAt(at);
        }
        return true;
      } catch {
        // Fail soft. A forced (manual) check returns false so SetupView can
        // surface its "check skipped" toast.
        return false;
      } finally {
        window.clearTimeout(timer);
        checkingRef.current = false;
        if (!opts?.silent) setChecking(false);
      }
    },
    [],
  );

  // While the shell is active, check on entry and then poll so the chip lights up
  // without a page refresh. Polls are silent; cached values seed instant display.
  React.useEffect(() => {
    if (!enabled) return undefined;
    void recheck({ silent: true });
    const id = window.setInterval(() => void recheck({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [enabled, recheck]);

  const requestUpdatesFocus = React.useCallback(() => setPendingUpdatesFocus(true), []);
  const clearUpdatesFocus = React.useCallback(() => setPendingUpdatesFocus(false), []);
  const patchComponentLatest = React.useCallback((name: string, version: string) => {
    setLatest((prev) => ({ ...prev, components: { ...prev.components, [name]: version } }));
  }, []);

  const hasUpdates = React.useMemo(
    () => (checkedAt ? computeHasUpdates(status, latest, __APP_VERSION__) : false),
    [status, latest, checkedAt],
  );

  const value = React.useMemo<UpdateCheckValue>(
    () => ({
      latest,
      checking,
      checkedAt,
      hasUpdates,
      recheck,
      patchComponentLatest,
      pendingUpdatesFocus,
      requestUpdatesFocus,
      clearUpdatesFocus,
    }),
    [
      latest,
      checking,
      checkedAt,
      hasUpdates,
      recheck,
      patchComponentLatest,
      pendingUpdatesFocus,
      requestUpdatesFocus,
      clearUpdatesFocus,
    ],
  );

  return <UpdateCheckContext.Provider value={value}>{children}</UpdateCheckContext.Provider>;
}
