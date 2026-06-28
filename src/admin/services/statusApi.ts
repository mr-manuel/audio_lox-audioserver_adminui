import { API_BASE } from '../config/apiConfig';
import type { StatusResponse } from '../types/api';
import { requestJson } from './http';

export type { StatusResponse };

export async function fetchStatus(signal?: AbortSignal): Promise<StatusResponse> {
  return requestJson(`${API_BASE}/info`, {
    signal,
    includeBodyInError: false,
    errorMessage: (res) => `Failed to fetch status (${res.status})`,
  });
}
