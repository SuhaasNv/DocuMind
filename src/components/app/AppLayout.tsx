import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from '@/components/app/Sidebar';
import SidebarContent from '@/components/app/SidebarContent';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAppStore } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { useIsMobile, useIsDesktop } from '@/hooks/use-mobile';

/**
 * Prevents any authenticated API call (SSE, chat, documents) from running before
 * Zustand persist hydration completes. Login/register are unauthenticated and
 * run outside this layout; all authenticated calls happen inside AppLayout
 * (Dashboard, ChatPage) only after this gate renders the outlet.
 */
const AppLayout = () => {
  const [hydrated, setHydrated] = useState(false);
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const persist = useAppStore.persist;
  const { mobileMenuOpen, setMobileMenuOpen, setSidebarOpen } = useAppStore();
  const enableAnimations = usePreferencesStore((s) => s.enableAnimations);

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

  useEffect(() => {
    if (isDesktop) setSidebarOpen(true);
  }, [isDesktop, setSidebarOpen]);

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
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : {};

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="noise-overlay" />

      {/* Mobile: sidebar as slide-in drawer from left */}
      {isMobile && (
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent
            side="left"
            className="w-[280px] max-w-[85vw] bg-sidebar border-sidebar-border p-0 pt-safe pl-safe flex flex-col gap-0 data-[state=open]:duration-200 data-[state=closed]:duration-200 [&>button]:top-safe"
          >
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <SidebarContent
                isExpanded={true}
                isMobileSheet={true}
                showLogo={true}
                onLinkClick={() => setMobileMenuOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}

      <Sidebar />

      <MainContent
        {...mainContentProps}
        className="flex-1 flex flex-col overflow-hidden min-w-0 min-h-0"
      >
        <Outlet />
      </MainContent>
    </div>
  );
};

export default AppLayout;
