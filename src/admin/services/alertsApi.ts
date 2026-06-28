import { API_BASE } from '../config/apiConfig';
import type { AlertFile, AlertListResponse } from '../types/api';
import { requestJson, requestOk } from './http';

export type { AlertFile, AlertListResponse };

export async function fetchAlertFiles(): Promise<AlertListResponse> {
  return requestJson(`${API_BASE}/alerts/files`, {
    errorMessage: 'Failed to load alerts',
  });
}

export async function uploadAlertFile(alertId: string, base64Data: string): Promise<void> {
  await requestOk(`${API_BASE}/alerts/files/${encodeURIComponent(alertId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64Data }),
    errorMessage: 'Failed to update alert',
  });
}

export async function revertAlertFile(alertId: string): Promise<void> {
  await requestOk(`${API_BASE}/alerts/files/${encodeURIComponent(alertId)}/revert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    errorMessage: 'Failed to revert alert',
  });
}
