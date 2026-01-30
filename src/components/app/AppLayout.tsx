import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '@/components/app/Sidebar';
import { useAppStore } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';

/**
 * Prevents any authenticated API call (SSE, chat, documents) from running before
 * Zustand persist hydration completes. Login/register are unauthenticated and
 * run outside this layout; all authenticated calls happen inside AppLayout
 * (Dashboard, ChatPage) only after this gate renders the outlet.
 */
const AppLayout = () => {
  const [hydrated, setHydrated] = useState(false);
  const persist = useAppStore.persist;
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);

  useEffect(() => {
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => setHydrated(true));
    // Fallback: if hydration doesn't complete (e.g. corrupt storage), show app after 3s
    const timeout = setTimeout(() => {
      setHydrated(true);
    }, 3000);
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

  const MainContent = enableAnimations ? motion.div : 'div';
  const mainContentProps = enableAnimations
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.3 } }
    : {};

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <MainContent
        {...mainContentProps}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Outlet />
      </MainContent>
    </div>
  );
};

export default AppLayout;
