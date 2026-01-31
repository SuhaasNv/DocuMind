import { useState, useEffect } from 'react';
import { initRuntimeConfig } from '@/lib/api';

/**
 * Loads /runtime-config.json (written at build from VITE_API_URL) before rendering children.
 * Ensures getApiBaseUrl() returns the production backend URL on Vercel even when build-time env was wrong.
 */
export function ApiConfigProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initRuntimeConfig().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return <>{children}</>;
}
