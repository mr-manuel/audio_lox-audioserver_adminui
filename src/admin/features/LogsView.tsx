import React from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLogs, openLogsStream, updateLogLevel } from '../services/logsApi';
import './LogsView.css';

type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'spam';

const LOG_VIEW_LIMIT = 250_000;
const ALL_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug', 'spam'];

interface ParsedLine {
  index: number;
  raw: string;
  time: string;
  level: LogLevel | null;
  module: string;
  message: string;
}

function normalizeLogContent(raw: string): string {
  if (!raw) return '';
  return String(raw).replace(/\r\n/g, '\n');
}

function trimLogContent(content: string, limit: number): string {
  if (!limit || content.length <= limit) return content;
  return content.slice(content.length - limit);
}

const LEVEL_ALIASES: Record<string, LogLevel> = {
  fatal: 'error',
  error: 'error',
  err: 'error',
  warning: 'warn',
  warn: 'warn',
  info: 'info',
  notice: 'info',
  debug: 'debug',
  trace: 'spam',
  spam: 'spam',
};

function parseLogLine(raw: string, index: number): ParsedLine {
  let rest = raw.trimEnd();
  let time = '';
  let level: LogLevel | null = null;
  let module = '';

  const isoBracket = rest.match(
    /^\[((\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z|[+-]\d{2}:?\d{2})?)\]\s*/,
  );
  if (isoBracket) {
    time = isoBracket[3];
    rest = rest.slice(isoBracket[0].length);
  }

  if (!time) {
    const bareTs = rest.match(
      /^(?:(\d{4}-\d{2}-\d{2})[T ])?(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:Z)?(?:[+-]\d{2}:?\d{2})?\s+/,
    );
    if (bareTs) {
      time = bareTs[2];
      rest = rest.slice(bareTs[0].length);
    }
  }

  if (!time) {
    const epochMatch = rest.match(/^\[?(\d{10,13})\]?\s+/);
    if (epochMatch) {
      try {
        const value = Number(epochMatch[1]);
        const date = new Date(epochMatch[1].length === 10 ? value * 1000 : value);
        if (!Number.isNaN(date.getTime())) {
          time = date.toISOString().slice(11, 23);
        }
      } catch {
        // ignore
      }
      rest = rest.slice(epochMatch[0].length);
    }
  }

  const levelMatch = rest.match(
    /^\[?(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|SPAM|FATAL|ERR|NOTICE)\]?:?\s*/i,
  );
  if (levelMatch) {
    const key = levelMatch[1].toLowerCase();
    level = LEVEL_ALIASES[key] ?? null;
    rest = rest.slice(levelMatch[0].length);
  }

  const moduleMatch = rest.match(/^\[([^\]]+)\]\s*/);
  if (moduleMatch) {
    module = moduleMatch[1];
    rest = rest.slice(moduleMatch[0].length);
  }

  return {
    index,
    raw,
    time,
    level,
    module,
    message: rest,
  };
}

type LogBufferState = {
  content: string;
  /** How many lines have been trimmed off the front since session start.
      Used to compute a stable #number that only goes up. */
  dropped: number;
};

function appendToBuffer(
  prev: LogBufferState,
  addition: string,
  limit: number,
): LogBufferState {
  if (!addition) return prev;
  const needsSep = prev.content && !prev.content.endsWith('\n');
  const combined = needsSep ? `${prev.content}\n${addition}` : `${prev.content}${addition}`;
  if (!limit || combined.length <= limit) {
    return { content: combined, dropped: prev.dropped };
  }
  const trimmed = combined.slice(combined.length - limit);
  const droppedPrefix = combined.slice(0, combined.length - limit);
  const newlyDropped = (droppedPrefix.match(/\n/g) ?? []).length;
  return { content: trimmed, dropped: prev.dropped + newlyDropped };
}

export default function LogsView(): JSX.Element {
  const { t } = useTranslation();
  const [buffer, setBuffer] = React.useState<LogBufferState>({ content: '', dropped: 0 });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [streaming, setStreaming] = React.useState(false);
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [filterText, setFilterText] = React.useState('');
  // Mockup default: debug + spam hidden until explicitly enabled.
  const [activeLevels, setActiveLevels] = React.useState<Set<LogLevel>>(
    () => new Set<LogLevel>(['error', 'warn', 'info']),
  );
  const [scrollAtBottom, setScrollAtBottom] = React.useState(true);

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const streamRef = React.useRef<EventSource | null>(null);
  // Guards handleScroll against auto-scroll induced events that would
  // otherwise flip autoScroll → false during the scroll animation.
  const programmaticScrollRef = React.useRef(false);

  const loadLogs = React.useCallback(async (signal?: AbortSignal): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogs(signal);
      if (signal?.aborted) return;
      const limit = typeof data.limit === 'number' && data.limit > 0 ? data.limit : LOG_VIEW_LIMIT;
      const missing = Boolean(data.missing);
      let nextContent = '';
      if (!missing && typeof data.log === 'string') {
        const normalized = normalizeLogContent(data.log);
        nextContent = trimLogContent(normalized, limit);
      }
      // Initial fetch resets the cumulative counter — we start numbering
      // from the first line we receive.
      setBuffer({ content: nextContent, dropped: 0 });
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load logs.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void loadLogs(controller.signal);
    return () => controller.abort();
  }, [loadLogs]);

  // Lock page scroll while Logs is mounted so the console can size itself
  // against the viewport (page chrome stays put, console fills the rest).
  React.useEffect(() => {
    document.body.classList.add('is-logs-locked');
    return () => document.body.classList.remove('is-logs-locked');
  }, []);

  // Always request maximum verbosity from server; filtering is client-side.
  React.useEffect(() => {
    void updateLogLevel('spam').catch(() => undefined);
  }, []);

  React.useEffect(() => {
    const source = openLogsStream();
    if (!source) return;
    streamRef.current = source;

    source.addEventListener('open', () => setStreaming(true));
    source.addEventListener('error', () => setStreaming(false));
    source.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data || '{}') as {
          line?: string;
          formatted?: string;
          message?: string;
        };
        const line = payload.line ?? payload.formatted ?? payload.message ?? '';
        if (!line) return;
        setBuffer((prev) => appendToBuffer(prev, normalizeLogContent(line), LOG_VIEW_LIMIT));
      } catch {
        // ignore malformed events
      }
    });

    return () => {
      if (streamRef.current) {
        try {
          streamRef.current.close();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
      setStreaming(false);
    };
  }, []);

  const parsedLines = React.useMemo((): ParsedLine[] => {
    if (!buffer.content) return [];
    return buffer.content.split('\n').filter((line) => line.length > 0).map(parseLogLine);
  }, [buffer.content]);

  const visibleLines = React.useMemo((): ParsedLine[] => {
    const needle = filterText.trim().toLowerCase();
    return parsedLines.filter((line) => {
      // Drop lines we couldn't parse a level for — they'd otherwise leak
      // through any active filter under a fallback bucket.
      if (line.level === null) return false;
      if (!activeLevels.has(line.level)) return false;
      if (!needle) return true;
      return line.raw.toLowerCase().includes(needle);
    });
  }, [parsedLines, activeLevels, filterText]);

  // Auto-scroll on new content when enabled. We flag the scroll as
  // programmatic so handleScroll ignores the resulting event.
  React.useEffect(() => {
    if (!autoScroll) return;
    const node = scrollRef.current;
    if (!node) return;
    programmaticScrollRef.current = true;
    node.scrollTop = node.scrollHeight;
    // Re-arm user-scroll detection on the next frame so a real
    // wheel/touch event after the jump still pauses live.
    const id = window.requestAnimationFrame(() => {
      programmaticScrollRef.current = false;
    });
    return () => window.cancelAnimationFrame(id);
  }, [visibleLines.length, autoScroll]);

  const handleScroll = (): void => {
    if (programmaticScrollRef.current) return;
    const node = scrollRef.current;
    if (!node) return;
    const fromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const atBottom = fromBottom < 40;
    setScrollAtBottom(atBottom);
    if (!atBottom && autoScroll) setAutoScroll(false);
  };

  const jumpToLive = (): void => {
    const node = scrollRef.current;
    if (!node) return;
    programmaticScrollRef.current = true;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    setAutoScroll(true);
    // Smooth animation can take ~400ms; clear the flag after to allow
    // subsequent user scrolls to be detected as such.
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 500);
  };

  const toggleLevel = (level: LogLevel): void => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  const handleCopy = (): void => {
    const text = visibleLines.map((line) => line.raw).join('\n');
    if (!text) return;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  };

  const handleDownload = (): void => {
    if (!buffer.content) return;
    const blob = new Blob([buffer.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sonn-core-logs-${stamp}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const handleClear = (): void => {
    setBuffer({ content: '', dropped: 0 });
  };

  // The "Live" pill reflects user intent (autoScroll). The SSE 'open' event
  // is not always reliable on reconnects, so we decouple the pill from the
  // streaming flag — the bottom status bar still surfaces transport state.
  const liveOn = autoScroll;
  const statusText = autoScroll
    ? streaming
      ? t('logs.status.streamingConnected')
      : t('logs.status.streaming')
    : t('logs.status.paused');

  return (
    <div className="logs-layout">
      <header className="logs-head">
        <div>
          <p className="logs-eyebrow">{t('logs.eyebrow')}</p>
          <h1 className="logs-title">{t('logs.title')}</h1>
          <p className="logs-subtitle">{t('logs.subtitle')}</p>
        </div>
      </header>

      <div className="logs-controls">
        <div className="logs-filter">
          <span className="logs-filter__icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            className="logs-filter__input"
            type="text"
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder={t('logs.filterPlaceholder')}
            aria-label={t('logs.filterAriaLabel')}
          />
          {filterText ? (
            <button
              type="button"
              className="logs-filter__clear"
              aria-label={t('logs.filterClearLabel')}
              onClick={() => setFilterText('')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className="logs-levels" role="group" aria-label={t('logs.eyebrow')}>
          {ALL_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              data-level={level}
              className={`logs-level${activeLevels.has(level) ? '' : ' is-off'}`}
              onClick={() => toggleLevel(level)}
            >
              <span className="logs-level__dot" />
              {t(`logs.levels.${level}`)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className={`logs-live-pill${liveOn ? ' is-on' : ' is-paused'}`}
          onClick={() => setAutoScroll((prev) => !prev)}
          aria-label={liveOn ? t('logs.paused') : t('logs.live')}
        >
          <span className="logs-live-pill__dot" />
          {liveOn ? t('logs.live') : t('logs.paused')}
        </button>
      </div>

      <div className="logs-console">
        <div
          ref={scrollRef}
          className="logs-console__scroll"
          onScroll={handleScroll}
          aria-label="Log output"
        >
          <div className="logs-console__lines">
            {visibleLines.length === 0 ? (
              <div className="logs-empty">
                <p className="logs-empty__title">
                  {loading
                    ? t('logs.empty.loadingTitle')
                    : error
                      ? t('logs.empty.errorTitle')
                      : buffer.content
                        ? t('logs.empty.noMatchTitle')
                        : t('logs.empty.noEntriesTitle')}
                </p>
                <p className="logs-empty__sub">
                  {error
                    ? error
                    : buffer.content
                      ? t('logs.empty.noMatchSub')
                      : t('logs.empty.noEntriesSub')}
                </p>
              </div>
            ) : (
              visibleLines.map((line) => (
                <div
                  key={`${buffer.dropped}-${line.index}`}
                  className={`log-line${line.level ? ` log-line--${line.level}` : ''}`}
                >
                  <span className="log-line__time">{line.time}</span>
                  <span className="log-line__num">#{buffer.dropped + line.index + 1}</span>
                  <span className="log-line__module">
                    <span className="log-line__dot" />
                    {line.module}
                  </span>
                  <span className="log-line__message">{line.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {loading ? (
          <div className="logs-loader" aria-hidden="true">
            <span className="logs-loader__mark">
              <svg viewBox="0 0 88 32">
                <g fill="currentColor">
                  <rect x="2" y="12" width="3" height="8" rx="1" opacity="0.4" />
                  <rect x="10" y="7" width="3" height="18" rx="1" opacity="0.6" />
                  <rect x="18" y="10" width="3" height="12" rx="1" opacity="0.8" />
                  <rect x="26" y="5" width="3" height="22" rx="1" />
                  <rect x="38" y="3" width="4" height="26" rx="1" />
                  <rect x="50" y="5" width="3" height="22" rx="1" />
                  <rect x="58" y="9" width="3" height="14" rx="1" opacity="0.9" />
                  <rect x="66" y="6" width="3" height="20" rx="1" opacity="0.8" />
                  <rect x="74" y="11" width="3" height="10" rx="1" opacity="0.7" />
                  <rect x="82" y="13" width="3" height="6" rx="1" opacity="0.6" />
                </g>
              </svg>
            </span>
            <span className="logs-loader__text">
              {t('logs.loaderConnecting')}<span className="logs-loader__dots" />
            </span>
            <span className="logs-loader__bar">
              <span />
            </span>
          </div>
        ) : null}

        <div className={`logs-statusbar${liveOn ? ' is-live' : ''}`}>
          <div className="logs-statusbar__left">
            <span className="logs-statusbar__dot" />
            <span>{statusText}</span>
          </div>
          <div className="logs-statusbar__actions">
            <span className="logs-sbtn logs-sbtn--static">
              <span className="logs-sbtn__count">{parsedLines.length.toLocaleString()}</span> {t('logs.lines')}
            </span>
            <button
              type="button"
              className="logs-sbtn"
              onClick={handleCopy}
              disabled={visibleLines.length === 0}
            >
              {t('logs.copy')}
            </button>
            <button
              type="button"
              className="logs-sbtn"
              onClick={handleDownload}
              disabled={!buffer.content}
            >
              {t('logs.download')}
            </button>
            <button
              type="button"
              className="logs-sbtn"
              onClick={handleClear}
              disabled={!buffer.content}
            >
              {t('logs.clear')}
            </button>
            {!scrollAtBottom && visibleLines.length > 0 ? (
              <button
                type="button"
                className="logs-sbtn logs-sbtn--accent"
                onClick={jumpToLive}
              >
                {t('logs.jumpToBottom')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
