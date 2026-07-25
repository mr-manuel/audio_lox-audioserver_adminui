import type { ComponentType } from 'react';
import SetupView from './features/SetupView';
import ProtocolsView from './features/ProtocolsView';
import ContentView from './features/ContentView';
import ZonesView from './features/ZonesView';
import LogsView from './features/LogsView';

export type TabConfig = {
  key: string;
  label: string;
  component: ComponentType;
};

export const ADMIN_TABS: readonly TabConfig[] = [
  { key: 'setup', label: 'Setup', component: SetupView },
  { key: 'protocols', label: 'Protocols', component: ProtocolsView },
  { key: 'content', label: 'Content', component: ContentView },
  { key: 'zones', label: 'Zones', component: ZonesView },
  { key: 'logs', label: 'Logs', component: LogsView },
];
