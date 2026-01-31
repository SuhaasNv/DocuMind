import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/useAppStore';
import { useIsMobile, useIsDesktop } from '@/hooks/use-mobile';
import SidebarContent from './SidebarContent';

/**
 * App sidebar: on mobile (< 768px) this component renders nothing (sidebar is in Sheet in AppLayout).
 * On tablet/desktop it renders an aside that is collapsible on tablet (768–1023) and persistent on desktop (1024+).
 */
const Sidebar = () => {
  const isMobile = useIsMobile();
  const isDesktop = useIsDesktop();
  const { isSidebarOpen, toggleSidebar } = useAppStore();

  if (isMobile) {
    return null;
  }

  const isExpanded = isDesktop || isSidebarOpen;
  const width = isDesktop ? 280 : isSidebarOpen ? 280 : 72;

  return (
    <motion.aside
      initial={false}
      animate={{ width }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col shrink-0"
    >
      {/* Header: logo (when expanded) + collapse toggle */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border shrink-0">
        <AnimatePresence mode="wait">
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2"
            >
              <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-foreground">DocuMind</span>
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
        {!isDesktop && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground"
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? (
              <ChevronLeft className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <SidebarContent isExpanded={isExpanded} isMobileSheet={false} showLogo={false} />
      </div>
    </motion.aside>
  );
};

export default Sidebar;
