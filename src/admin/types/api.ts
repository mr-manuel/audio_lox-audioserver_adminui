export type StatusResponse = {
  version?: string;
  uptime?: number;
  name?: string;
  serial?: string;
  firmwareVersion?: string;
  apiVersion?: string;
  miniserverIp?: string;
  miniserverSerial?: string;
  zones?: number;
  activeAdapters?: number;
  paired?: boolean;
  authEnabled?: boolean;
  containerized?: boolean;
  // Whether a server-core update will auto-restart (containerized or supervised).
  restartSupervised?: boolean;
  packages?: Record<string, { installed: string | null; declared: string | null }>;
  player?: { installed: string | null };
  timestamp?: number | string;
};

export type LogsResponse = {
  log?: string;
  limit?: number;
  missing?: boolean;
  updatedAt?: string;
  size?: number;
  truncated?: boolean;
  consoleLevel?: string;
};

export type GroupRecord = {
  leader: number;
  leaderName: string;
  members: number[];
  memberNames: string[];
  backend: string;
  externalId: string | null;
  source: string;
  updatedAt: number;
};

export type GroupsResponse = {
  groups?: GroupRecord[];
};

export type AlertFile = {
  id: string;
  filename: string;
  url: string;
  hasBackup?: boolean;
};

export type AlertListResponse = {
  alerts?: AlertFile[];
};
