export function formatTimestamp(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function formatDuration(value: number | undefined): string | null {
  if (!Number.isFinite(value)) return null;
  const totalSeconds = Math.max(0, Math.floor(value ?? 0));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatUptime(seconds?: number): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  const totalSeconds = Math.floor(seconds);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.slice(0, 2).join(' ');
}

export function formatSampleRate(value?: number | null): string | null {
  if (!value || !Number.isFinite(value)) return null;
  if (value >= 100000) {
    return `${(value / 1000).toFixed(0)} kHz`;
  }
  if (value >= 1000) {
    const rounded = (value / 1000).toFixed(1);
    return `${rounded} kHz`;
  }
  return `${value} Hz`;
}

export function formatSeconds(value?: number | null): string | null {
  if (!Number.isFinite(value ?? NaN)) return null;
  const total = Math.max(0, Math.floor(value ?? 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBitrate(bps?: number | null): string | null {
  if (!Number.isFinite(bps ?? NaN) || (bps ?? 0) <= 0) return null;
  const kbps = (bps ?? 0) / 1000;
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(2)} Mbps`;
  }
  return `${kbps.toFixed(0)} kbps`;
}

export function formatAgeMs(timestamp?: number | null): string | null {
  if (!Number.isFinite(timestamp ?? NaN)) return null;
  const raw = Number(timestamp ?? 0);
  const ts = raw < 1_000_000_000_000 ? raw * 1000 : raw;
  const delta = Math.max(0, Date.now() - ts);
  return formatSeconds(delta / 1000);
}

export function formatBytes(bytes?: number | null): string | null {
  if (!Number.isFinite(bytes ?? NaN) || (bytes ?? 0) <= 0) return null;
  const value = bytes ?? 0;
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.round(value / 1024)} KB`;
}
