import { API_BASE } from '../config/apiConfig';
import { requestJson } from './http';
import type { StatusResponse } from '../types/api';


export type LatestVersions = {
  core: string | null;
  corePrerelease: string | null;
  ui: string | null;
  player: string | null;
  components: Record<string, string>;
  componentDescriptions: Record<string, string>;
};

export const EMPTY_LATEST: LatestVersions = {
  core: null,
  corePrerelease: null,
  ui: null,
  player: null,
  components: {},
  componentDescriptions: {},
};

// The cached result seeds instant display on load; freshness is governed by the
// backend (which caches the upstream GitHub/npm queries) and the shell's poll.
const CACHE_KEY = 'lox.admin.updateCheck';

export function normalizeTag(tag: string | null | undefined): string {
  return (tag ?? '').trim().replace(/^v/i, '');
}

export function normalizeVersion(input: string): { parts: number[]; prerelease: string | null } | null {
  const trimmed = input.trim().replace(/^v/i, '');
  if (!trimmed) return null;
  const [withoutBuild] = trimmed.split('+', 1);
  const [core, pre] = withoutBuild.split('-', 2);
  const parts = (core ?? '').split('.').map((part) => Number.parseInt(part.replace(/\D+.*$/, ''), 10));
  if (parts.some((part) => Number.isNaN(part))) return null;
  while (parts.length < 3) parts.push(0);
  return { parts, prerelease: pre ? pre.trim() : null };
}

export function comparePrerelease(a: string | null, b: string | null): -1 | 0 | 1 {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  const aIds = a.split('.');
  const bIds = b.split('.');
  const max = Math.max(aIds.length, bIds.length);

  for (let i = 0; i < max; i += 1) {
    const ai = aIds[i];
    const bi = bIds[i];
    if (ai === undefined) return -1;
    if (bi === undefined) return 1;
    if (ai === bi) continue;

    const aiIsNum = /^\d+$/.test(ai);
    const biIsNum = /^\d+$/.test(bi);
    if (aiIsNum && biIsNum) {
      const aNum = Number(ai);
      const bNum = Number(bi);
      if (aNum < bNum) return -1;
      if (aNum > bNum) return 1;
      continue;
    }
    if (aiIsNum && !biIsNum) return -1;
    if (!aiIsNum && biIsNum) return 1;
    return ai < bi ? -1 : 1;
  }

  return 0;
}

export function compareSemver(current: string, latest: string): -1 | 0 | 1 {
  const currentNorm = normalizeVersion(current);
  const latestNorm = normalizeVersion(latest);
  if (!currentNorm || !latestNorm) return 0;
  const length = Math.max(currentNorm.parts.length, latestNorm.parts.length);
  for (let i = 0; i < length; i += 1) {
    const a = currentNorm.parts[i] ?? 0;
    const b = latestNorm.parts[i] ?? 0;
    if (a < b) return -1;
    if (a > b) return 1;
  }
  return comparePrerelease(currentNorm.prerelease, latestNorm.prerelease);
}

/** Fetches the latest available versions from our own backend, which polls
 *  GitHub + npm once and caches the result server-side. This keeps every admin
 *  browser/tab behind one IP from independently hammering the upstream APIs
 *  (GitHub allows only 60 req/h per IP unauthenticated). */
export async function fetchLatestVersions(
  signal?: AbortSignal,
  opts?: { force?: boolean },
): Promise<LatestVersions> {
  const data = await requestJson<{ latest?: Partial<LatestVersions>; checkedAt?: string }>(
    `${API_BASE}/updates/check${opts?.force ? '?force=1' : ''}`,
    { signal, includeBodyInError: false, errorMessage: 'Failed to check for updates' },
  );
  return { ...EMPTY_LATEST, ...data.latest };
}

/**
 * The add-on packages this install tracks, taken from the backend rather than a
 * hardcoded list. The server derives them from core's package.json (every
 * `@sonn-audio/node-*` dependency), reporting installed/declared under
 * `status.packages` and the latest npm version under `latest.components` — so a
 * newly added package appears here automatically, with no second list to keep in
 * sync. Union of both key sets, so a package still shows if one side has not
 * answered yet.
 */
export function componentPackageNames(
  status: StatusResponse | null,
  latest: LatestVersions,
): string[] {
  const names = new Set<string>([
    ...Object.keys(status?.packages ?? {}),
    ...Object.keys(latest.components ?? {}),
  ]);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** Rolls up whether any tracked artifact (core, admin UI, player, component) is
 *  behind its latest known release, given the running install's versions. */
export function computeHasUpdates(
  status: StatusResponse | null,
  latest: LatestVersions,
  appVersion: string,
): boolean {
  const version = status?.version ?? status?.apiVersion ?? '';
  const coreIsPrerelease = version.includes('-');
  const coreComparison = latest.core && version ? compareSemver(version, latest.core) : null;
  const corePrereleaseComparison =
    coreIsPrerelease && latest.corePrerelease && version
      ? compareSemver(version, latest.corePrerelease)
      : null;
  const coreOutdated = coreComparison === -1 || corePrereleaseComparison === -1;
  const uiOutdated = Boolean(latest.ui && compareSemver(appVersion, latest.ui) === -1);
  const playerInstalled = status?.player?.installed ?? null;
  const playerOutdated = Boolean(
    playerInstalled && latest.player && compareSemver(playerInstalled, latest.player) === -1,
  );
  const componentOutdated = componentPackageNames(status, latest).some((name) => {
    const current = status?.packages?.[name]?.installed;
    const latestVer = latest.components[name];
    return current && latestVer ? compareSemver(current, latestVer) === -1 : false;
  });
  return Boolean(coreOutdated || uiOutdated || playerOutdated || componentOutdated);
}

export type CachedCheck = { latest: LatestVersions; checkedAt: string };

export function readCachedCheck(): CachedCheck | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedCheck>;
    if (!parsed || typeof parsed.checkedAt !== 'string' || !parsed.latest) return null;
    return { latest: { ...EMPTY_LATEST, ...parsed.latest }, checkedAt: parsed.checkedAt };
  } catch {
    return null;
  }
}

export function writeCachedCheck(latest: LatestVersions, checkedAt: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ latest, checkedAt }));
  } catch {
    // ignore storage errors (private mode / quota)
  }
}
