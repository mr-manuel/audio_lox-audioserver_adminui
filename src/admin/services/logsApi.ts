import { API_BASE, isRemoteBase, withAuthQuery } from '../config/apiConfig';
import type { LogsResponse } from '../types/api';
import { requestJson, requestOk } from './http';

export type { LogsResponse };

export async function fetchLogs(signal?: AbortSignal): Promise<LogsResponse> {
  return requestJson(`${API_BASE}/logs`, {
    signal,
    includeBodyInError: false,
    errorMessage: 'Failed to fetch logs',
  });
}

export function openLogsStream(): EventSource | null {
  if (typeof EventSource === 'undefined') return null;
  // EventSource can't set an Authorization header; same-origin uses the cookie (withCredentials),
  // a remote peer carries the bearer token as a query param and must NOT send credentials (the
  // backend's wildcard CORS rejects credentialed cross-origin requests).
  return new EventSource(withAuthQuery(`${API_BASE}/logs/stream`), {
    withCredentials: !isRemoteBase(),
  });
}

export async function updateLogLevel(level: string): Promise<void> {
  await requestOk(`${API_BASE}/logs/level`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ level }),
    errorMessage: 'Failed to update log level',
  });
}
