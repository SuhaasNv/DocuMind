import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '@/components/app/Sidebar';
import { useAppStore } from '@/stores/useAppStore';

/**
 * Prevents any authenticated API call (SSE, chat, documents) from running before
 * Zustand persist hydration completes. Login/register are unauthenticated and
 * run outside this layout; all authenticated calls happen inside AppLayout
 * (Dashboard, ChatPage) only after this gate renders the outlet.
 */
const AppLayout = () => {
  const [hydrated, setHydrated] = useState(false);
  const persist = useAppStore.persist;

  useEffect(() => {
    if (persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [persist]);

  if (!hydrated) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Outlet />
      </motion.div>
    </div>
  );
};

export default AppLayout;
