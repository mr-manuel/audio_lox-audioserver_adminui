type ReleaseFn = () => void;

function toDatasetKey(className: string): string {
  // dataset keys must be camelCase-ish; keep it stable and collision-safe.
  const cleaned = className.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const parts = cleaned.split(' ').filter(Boolean);
  return `loxLock${parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('')}`;
}

/**
 * Reference-count a class on document.body so multiple modals can stack without
 * prematurely unlocking scroll when one closes.
 */
export function lockBodyClass(className: string): ReleaseFn {
  if (typeof document === 'undefined') return () => {};
  const body = document.body;
  const key = toDatasetKey(className);
  const current = Number.parseInt(body.dataset[key] ?? '0', 10) || 0;
  const next = current + 1;
  body.dataset[key] = String(next);
  body.classList.add(className);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const value = Number.parseInt(body.dataset[key] ?? '0', 10) || 0;
    const remaining = Math.max(0, value - 1);
    if (remaining === 0) {
      delete body.dataset[key];
      body.classList.remove(className);
    } else {
      body.dataset[key] = String(remaining);
    }
  };
}

