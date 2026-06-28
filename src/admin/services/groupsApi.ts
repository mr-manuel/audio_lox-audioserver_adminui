import { API_BASE } from '../config/apiConfig';
import type { GroupRecord, GroupsResponse } from '../types/api';
import { requestJson } from './http';

export type { GroupRecord, GroupsResponse };

export async function fetchGroups(): Promise<GroupRecord[]> {
  const data = await requestJson<GroupsResponse>(`${API_BASE}/groups`, {
    errorMessage: 'Failed to fetch groups',
  });
  return data.groups ?? [];
}
