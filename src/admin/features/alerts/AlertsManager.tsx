import React from 'react';
import './AlertsManager.css';
import InlineState from '../../components/InlineState';
import { useGlobalAlert } from '../../components/GlobalAlert';
import { fetchAlertFiles, revertAlertFile, uploadAlertFile } from '../../services/alertsApi';
import type { AlertFile } from '../../services/alertsApi';

type AlertPlaybackRowProps = {
  alert: AlertFile;
  saving: boolean;
  isActive: boolean;
  onActivate: (alertId: string) => void;
  onDeactivate: (alertId: string) => void;
  onUpload: (alertId: string, file: File | null) => Promise<void>;
  onRevert: (alertId: string) => Promise<void>;
};

function getAlertFriendlyName(alertId: string): string {
  if (alertId === 'firealarm') return 'Fire alarm';
  return alertId.charAt(0).toUpperCase() + alertId.slice(1);
}

function AlertPlaybackRow({
  alert,
  saving,
  isActive,
  onActivate,
  onDeactivate,
  onUpload,
  onRevert,
}: AlertPlaybackRowProps): JSX.Element {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const pendingSeekRef = React.useRef<number | null>(null);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [dragActive, setDragActive] = React.useState(false);

  const resolveDuration = (audio: HTMLAudioElement): number => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return audio.duration;
    }
    if (audio.seekable?.length) {
      const end = audio.seekable.end(audio.seekable.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
    if (audio.buffered?.length) {
      const end = audio.buffered.end(audio.buffered.length - 1);
      if (Number.isFinite(end) && end > 0) return end;
    }
    return 0;
  };

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const syncTime = (): void => {
      setDuration(resolveDuration(audio));
      setCurrentTime(audio.currentTime);
    };
    const applyPendingSeek = (): void => {
      const pending = pendingSeekRef.current;
      if (pending === null) return;
      const resolvedDuration = resolveDuration(audio);
      if (!resolvedDuration) return;
      const newTime = (pending / 100) * resolvedDuration;
      audio.currentTime = newTime;
      setCurrentTime(newTime);
      pendingSeekRef.current = null;
    };

    const handleLoadedMetadata = (): void => {
      syncTime();
      applyPendingSeek();
    };
    const handlePlay = (): void => {
      setPlaying(true);
    };
    const handlePause = (): void => {
      setPlaying(false);
    };
    const handleEnded = (): void => {
      setPlaying(false);
      onDeactivate(alert.id);
      setCurrentTime(0);
    };
    const handleTimeUpdate = (): void => {
      setCurrentTime(audio.currentTime);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [alert.id, onDeactivate]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isActive) return;
    audio.pause();
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    pendingSeekRef.current = null;
    audio.load();
  }, [isActive, alert.url]);

  React.useEffect(() => {
    if (!playing) return undefined;
    let raf: number;
    const tick = (): void => {
      const audio = audioRef.current;
      if (audio) {
        setCurrentTime(audio.currentTime);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlayback = (): void => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      onDeactivate(alert.id);
      return;
    }
    onActivate(alert.id);
    void audio.play();
  };

  const handleSeek = (value: number): void => {
    const audio = audioRef.current;
    if (!audio) return;
    const resolvedDuration = resolveDuration(audio);
    if (!resolvedDuration) {
      pendingSeekRef.current = value;
      audio.load();
      return;
    }
    const newTime = (value / 100) * resolvedDuration;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const fallbackDuration =
    duration > 0
      ? duration
      : audioRef.current && Number.isFinite(audioRef.current.duration) && audioRef.current.duration > 0
        ? audioRef.current.duration
        : 0;
  const sliderValue = fallbackDuration > 0 ? Math.min((currentTime / fallbackDuration) * 100, 100) : 0;

  return (
    <div className="alerts-item">
      <div className="alerts-item__header">
        <span className="alerts-item__title">{getAlertFriendlyName(alert.id)}</span>
        <span className="alerts-item__filename">{alert.filename}</span>
      </div>
      <div className="alerts-player">
        <button
          type="button"
          className={`alerts-playbutton ${playing ? 'is-playing' : ''}`}
          onClick={togglePlayback}
          aria-label={`${playing ? 'Pause' : 'Play'} ${getAlertFriendlyName(alert.id)}`}
        >
          {playing ? (
            <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" focusable="false">
              <rect x="0" y="0" width="4" height="16" rx="1.5" fill="currentColor" />
              <rect x="10" y="0" width="4" height="16" rx="1.5" fill="currentColor" />
            </svg>
          ) : (
            <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true" focusable="false">
              <path d="M2 1L15 9L2 17V1Z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="alerts-track">
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={sliderValue}
            onChange={(e) => handleSeek(Number(e.target.value))}
            aria-label={`${getAlertFriendlyName(alert.id)} playback position`}
          />
        </div>
      </div>
      <audio ref={audioRef} src={alert.url} preload="auto" className="alerts-hidden-audio">
        Your browser does not support the audio element.
      </audio>
      <div
        className={`alerts-dropzone ${dragActive ? 'is-active' : ''} ${saving ? 'is-disabled' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!saving) setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDragActive(false);
          if (saving) return;
          const file = event.dataTransfer.files?.[0] ?? null;
          void onUpload(alert.id, file);
        }}
      >
        <div className="alerts-dropzone__title">{saving ? 'Uploading…' : 'Drop MP3 here'}</div>
        <div className="alerts-dropzone__meta">or click to upload</div>
        <input
          type="file"
          accept="audio/mpeg,audio/mp3"
          disabled={saving}
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;
            void onUpload(alert.id, file);
            e.target.value = '';
          }}
        />
      </div>
      <div className="alerts-actions">
        <button
          type="button"
          className="secondary"
          disabled={!alert.hasBackup || saving}
          onClick={() => {
            void onRevert(alert.id);
          }}
        >
          Revert to original
        </button>
      </div>
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return window.btoa(binary);
}

export default function AlertsManager(): JSX.Element {
  const { push: pushAlert } = useGlobalAlert();
  const [alerts, setAlerts] = React.useState<AlertFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [activeAlertId, setActiveAlertId] = React.useState<string | null>(null);

  const refresh = React.useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const payload = await fetchAlertFiles();
      setAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
    } catch (err) {
      setAlerts([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = React.useCallback(
    async (alertId: string, file: File | null): Promise<void> => {
      if (!file) return;
      setSaving(true);
      try {
        const base64 = await fileToBase64(file);
        await uploadAlertFile(alertId, base64);
        await refresh();
        pushAlert({ type: 'success', message: 'Alert updated successfully' });
      } catch (err) {
        pushAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to update alert' });
      } finally {
        setSaving(false);
      }
    },
    [pushAlert, refresh],
  );

  const handleRevert = React.useCallback(
    async (alertId: string): Promise<void> => {
      setSaving(true);
      try {
        await revertAlertFile(alertId);
        await refresh();
        pushAlert({ type: 'success', message: 'Alert restored to original' });
      } catch (err) {
        pushAlert({ type: 'error', message: err instanceof Error ? err.message : 'Failed to revert alert' });
      } finally {
        setSaving(false);
      }
    },
    [pushAlert, refresh],
  );

  return (
    <div className="alerts-manager">
      <div className="setup-system-header">
        <h4>Built-in alerts</h4>
        <p>Preview and replace the siren, bell, and buzzer MP3 files that ship with the AudioServer.</p>
      </div>

      {loading ? (
        <InlineState kind="loading" title="Loading alerts…" compact />
      ) : loadError ? (
        <InlineState
          kind="error"
          title="Failed to load alerts"
          message={loadError}
          compact
          action={{ label: 'Retry', onClick: () => void refresh(), variant: 'secondary' }}
        />
      ) : alerts.length === 0 ? (
        <InlineState kind="empty" title="No alerts found" compact />
      ) : (
        <div className="alerts-grid">
          {alerts.map((alert) => (
            <AlertPlaybackRow
              key={alert.id}
              alert={alert}
              saving={saving}
              isActive={activeAlertId === alert.id}
              onActivate={(id) => setActiveAlertId(id)}
              onDeactivate={(id) => {
                setActiveAlertId((current) => (current === id ? null : current));
              }}
              onUpload={handleUpload}
              onRevert={handleRevert}
            />
          ))}
        </div>
      )}
    </div>
  );
}
