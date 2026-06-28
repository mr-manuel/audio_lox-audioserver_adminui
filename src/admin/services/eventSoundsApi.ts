import { API_BASE } from '../config/apiConfig';
import { requestOk } from './http';

export async function uploadEventSound(filename: string, base64Data: string): Promise<void> {
  await requestOk(`${API_BASE}/alerts/event-sounds/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, data: base64Data }),
    errorMessage: 'Failed to upload event sound',
  });
}
