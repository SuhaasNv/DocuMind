/**
 * Single source of truth for backend API base URL.
 * All fetch/SSE calls must use getApiBaseUrl() so frontend–backend connectivity is consistent.
 *
 * For local dev: set VITE_API_URL in .env at the project root (e.g. VITE_API_URL=http://localhost:3000).
 * Vite only exposes env vars prefixed with VITE_. If unset, the app still loads and shows a banner.
 */
const env = (import.meta as unknown as { env: { VITE_API_URL?: string; VITE_APP_VERSION?: string; MODE?: string } }).env;

/** Returns base URL or null if not set. Never throws so the app can always render. */
export function getApiBaseUrl(): string | null {
  const url = env.VITE_API_URL;
  if (url === undefined || url === '') return null;
  return url.replace(/\/$/, ''); // strip trailing slash
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
