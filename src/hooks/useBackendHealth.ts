import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/api';

export interface BackendHealthState {
  /** True once the first health check has completed (success or failure). */
  checked: boolean;
  /** True if GET /health returned 200. */
  reachable: boolean;
  /** Actual error message when unreachable (e.g. "Failed to fetch"). */
  error: string | null;
}

/**
 * Calls GET /health on mount to verify frontend–backend connectivity.
 * Used on app boot; does not block render. Show a banner when reachable === false.
 */
export function useBackendHealth(): BackendHealthState {
  const [state, setState] = useState<BackendHealthState>({
    checked: false,
    reachable: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const url = `${getApiBaseUrl()}/health`;

    fetch(url, { method: 'GET' })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setState({ checked: true, reachable: true, error: null });
        } else {
          setState({
            checked: true,
            reachable: false,
            error: `HTTP ${res.status}`,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setState({ checked: true, reachable: false, error: message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
