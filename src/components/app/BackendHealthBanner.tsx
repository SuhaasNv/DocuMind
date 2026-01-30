import { useBackendHealth } from '@/hooks/useBackendHealth';
import { getApiBaseUrl } from '@/lib/api';
import { AlertCircle } from 'lucide-react';

/**
 * Shows a banner when the backend is unreachable (health check failed on app boot).
 * Displays the actual HTTP/network error cause, not a generic message.
 */
export default function BackendHealthBanner() {
  const { checked, reachable, error } = useBackendHealth();

  if (!checked || reachable) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-4 py-2 bg-destructive/10 border-b border-destructive/30 text-destructive text-sm"
    >
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>
        Backend unreachable at {getApiBaseUrl()}. {error ?? 'Unknown error'}
      </span>
    </div>
  );
}
