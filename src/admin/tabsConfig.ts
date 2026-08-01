/**
 * The tabs, and the moment each one's code arrives.
 *
 * These five views are most of this application by weight — `ZonesView` and `ContentView` alone are over
 * 450 kB of source — and every one of them used to be in the bundle the browser had to parse before it
 * could draw the sign-in field. Nobody signs in to five tabs at once; you arrive at one. So each is
 * behind its own `import()`, which is the whole of Vite's "chunks are larger than 500 kB" note and, more
 * to the point, is what makes the first paint the weight of a login form rather than the weight of the
 * console.
 *
 * The loaders are named here rather than inlined into `lazy()` so `prefetchTabs` can reach them:
 * splitting for the first paint would be a poor trade if it made *switching* tabs wait. See `AdminShell`,
 * which asks for the rest as soon as the browser is idle — by the time anyone reaches for a second tab
 * its chunk has been in the cache for a while.
 */
import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

const loaders = {
  setup: () => import('./features/SetupView'),
  content: () => import('./features/ContentView'),
  access: () => import('./features/AccessView'),
  zones: () => import('./features/ZonesView'),
  logs: () => import('./features/LogsView'),
};

export type TabConfig = {
  key: string;
  label: string;
  component: ComponentType | LazyExoticComponent<ComponentType>;
};

export const ADMIN_TABS: readonly TabConfig[] = [
  { key: 'setup', label: 'Setup', component: lazy(loaders.setup) },
  { key: 'content', label: 'Content', component: lazy(loaders.content) },
  { key: 'access', label: 'Access', component: lazy(loaders.access) },
  { key: 'zones', label: 'Zones', component: lazy(loaders.zones) },
  { key: 'logs', label: 'Logs', component: lazy(loaders.logs) },
];

/**
 * Ask for the tabs nobody has opened yet, once there is nothing better to do.
 *
 * Fire-and-forget on purpose: a rejected chunk request here means nothing, because the same `import()`
 * runs again — and this time reports its failure somewhere it can be seen — when the tab is opened.
 */
export function prefetchTabs(): void {
  for (const load of Object.values(loaders)) {
    void load().catch(() => undefined);
  }
}
