/**
 * Single source of truth for backend API base URL.
 * All fetch/SSE calls must use getApiBaseUrl() so frontend–backend connectivity is consistent.
 *
 * Sources (first wins): runtime config (from /runtime-config.json), then VITE_API_URL at build.
 * Runtime config is written at build from VITE_API_URL so Vercel/production always get the right URL.
 */
const env = (import.meta as unknown as { env: { VITE_API_URL?: string; VITE_APP_VERSION?: string; MODE?: string } }).env;

let runtimeApiUrl: string | null = null;

/** Set by ApiConfigProvider after loading /runtime-config.json. Overrides build-time env. */
export function setRuntimeApiUrl(url: string | null): void {
  runtimeApiUrl = url ? url.replace(/\/$/, '') : null;
}

/** Returns base URL or null if not set. Never throws so the app can always render. */
export function getApiBaseUrl(): string | null {
  if (runtimeApiUrl !== null && runtimeApiUrl !== '') return runtimeApiUrl;
  const url = env.VITE_API_URL;
  if (url === undefined || url === '') return null;
  return url.replace(/\/$/, ''); // strip trailing slash
}

/** Load /runtime-config.json and set runtime API URL. In development we skip fetch and use .env only. */
export function initRuntimeConfig(): Promise<void> {
  const isDev = (import.meta as unknown as { env: { DEV?: boolean } }).env?.DEV === true;
  if (isDev) {
    return Promise.resolve();
  }
  const timeoutMs = 2000;
  return Promise.race([
    fetch('/runtime-config.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('No runtime config'))))
      .then((data: { apiUrl?: string }) => {
        const url = typeof data?.apiUrl === 'string' ? data.apiUrl.trim() : '';
        if (url) setRuntimeApiUrl(url);
      })
      .catch(() => {}),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ]);
}

/** Use when you need a URL and want to throw if missing (e.g. inside try/catch). */
export function getApiBaseUrlOrThrow(): string {
  const url = getApiBaseUrl();
  if (url === null) {
    throw new Error(
      'VITE_API_URL is not set. Add it to .env at the project root (e.g. VITE_API_URL=http://localhost:3000) and restart the dev server.',
    );
  }
  return url;
}

/** App version (set VITE_APP_VERSION in .env or defaults to 0.0.0). */
export const APP_VERSION = env.VITE_APP_VERSION ?? '0.0.0';

/** Build mode: development | production. */
export const APP_ENV = env.MODE ?? 'development';

/**
 * Returns a user-facing error message for API failures.
 * Uses the actual HTTP/network error cause (e.g. "Failed to fetch") instead of a generic message.
 */
export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof Error && err.message && err.message.trim() !== '') {
    return err.message.trim();
  }
  return fallback;
}
