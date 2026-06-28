import { authHeaders, credentialsMode } from '../config/apiConfig';

type ErrorMessage = string | ((res: Response) => string);

type RequestOptions = RequestInit & {
  errorMessage?: ErrorMessage;
  includeBodyInError?: boolean;
  suppressAuthReset?: boolean;
};

// Merge the active base's bearer token + correct credentials mode into the request. Same-origin
// uses the cookie (credentials:include); cross-origin peers use the token and must omit credentials
// (the backend's wildcard CORS rejects credentialed requests). Caller values win over the defaults.
function mergeAuth(init: RequestInit): RequestInit {
  return {
    credentials: credentialsMode(),
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  };
}

export function emitAuthReset(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('lox:auth-reset'));
}

async function handleError(
  res: Response,
  errorMessage?: ErrorMessage,
  includeBodyInError = true,
  suppressAuthReset = false,
): Promise<never> {
  if (res.status === 401 && !suppressAuthReset) {
    emitAuthReset();
  }
  const text = includeBodyInError ? await res.text().catch(() => '') : '';
  const fallback =
    typeof errorMessage === 'function'
      ? errorMessage(res)
      : errorMessage ?? `Request failed (${res.status})`;
  throw new Error(text || fallback);
}

export async function requestJson<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { errorMessage, includeBodyInError, suppressAuthReset, ...init } = options;
  const res = await fetch(url, mergeAuth(init));
  if (!res.ok) {
    await handleError(res, errorMessage, includeBodyInError, suppressAuthReset);
  }
  return (await res.json()) as T;
}

export async function requestOk(url: string, options: RequestOptions = {}): Promise<void> {
  const { errorMessage, includeBodyInError, suppressAuthReset, ...init } = options;
  const res = await fetch(url, mergeAuth(init));
  if (!res.ok) {
    await handleError(res, errorMessage, includeBodyInError, suppressAuthReset);
  }
}
