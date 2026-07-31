import type { ComponentType } from 'react';
import SetupView from './features/SetupView';
import ContentView from './features/ContentView';
import AccessView from './features/AccessView';
import ZonesView from './features/ZonesView';
import SonnClientsView from './features/SonnClientsView';
import LogsView from './features/LogsView';

export type TabConfig = {
  key: string;
  label: string;
  component: ComponentType;
};

export const ADMIN_TABS: readonly TabConfig[] = [
  { key: 'setup', label: 'Setup', component: SetupView },
  { key: 'content', label: 'Content', component: ContentView },
  { key: 'access', label: 'Access', component: AccessView },
  { key: 'zones', label: 'Zones', component: ZonesView },
  // Speakers this server administers, as opposed to rooms it plays into. Next to Zones because
  // that is the screen a player created here is assigned on.
  { key: 'devices', label: 'Devices', component: SonnClientsView },
  { key: 'logs', label: 'Logs', component: LogsView },
];
