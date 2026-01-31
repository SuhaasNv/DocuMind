import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';

/**
 * Protects /app and /chat routes: waits for Zustand persistence hydration,
 * then redirects to /login when unauthenticated. No API or SSE runs before
 * auth is confirmed because children (AppLayout + outlet) only render when
 * authenticated.
 */
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const persist = useAppStore.persist;
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => setHydrated(true));
    const timeout = setTimeout(() => setHydrated(true), 3000);
    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [persist]);

  if (!hydrated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent"
          aria-hidden
        />
        <p className="text-foreground text-sm font-medium">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
