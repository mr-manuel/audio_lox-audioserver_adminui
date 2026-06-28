import React from 'react';

type PollingOptions = {
  delay: number;
  enabled?: boolean;
  immediate?: boolean;
};

type PollingResult = number | void;
type PollingCallback = (signal?: AbortSignal) => PollingResult | Promise<PollingResult>;

export function usePolling(
  callback: PollingCallback,
  { delay, enabled = true, immediate = true }: PollingOptions,
): void {
  const savedCallback = React.useRef(callback);

  React.useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  React.useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    let cancelled = false;
    let timer: number | undefined;
    const controller = new AbortController();

    const tick = async (): Promise<void> => {
      const nextDelay = await savedCallback.current(controller.signal);
      if (cancelled) return;
      const delayMs =
        typeof nextDelay === 'number' && Number.isFinite(nextDelay) ? nextDelay : delay;
      timer = window.setTimeout(tick, delayMs);
    };

    if (immediate) {
      void tick();
    } else {
      timer = window.setTimeout(tick, delay);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [delay, enabled, immediate]);
}
