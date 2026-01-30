/**
 * Single source of truth for backend API base URL.
 * All fetch/SSE calls must use getApiBaseUrl() so frontend–backend connectivity is consistent.
 *
 * Required for local dev: set VITE_API_URL in .env (e.g. VITE_API_URL=http://localhost:3000).
 * Vite only exposes env vars prefixed with VITE_. See project .env.example.
 */
const env = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env;

function getApiBaseUrlOrThrow(): string {
  const url = env.VITE_API_URL;
  if (url === undefined || url === '') {
    throw new Error(
      '[DocuMind] VITE_API_URL is required. Set it in .env at the project root (e.g. VITE_API_URL=http://localhost:3000). Restart the Vite dev server after changing .env.',
    );
  }
  return url.replace(/\/$/, ''); // strip trailing slash so callers can do `${base}/auth/login`
}

export function getApiBaseUrl(): string {
  return getApiBaseUrlOrThrow();
}

/** Resolved base URL at module load; used for health check and startup. Throws if VITE_API_URL is unset. */
export const API_BASE_URL = getApiBaseUrlOrThrow();

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
