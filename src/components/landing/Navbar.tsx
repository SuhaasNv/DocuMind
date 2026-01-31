import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FileText, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppStore } from '@/stores/useAppStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const NAV_LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/docs', label: 'Docs' },
  { to: '/about', label: 'About' },
];

const Navbar = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAuthenticated = useAppStore((s) => s.isAuthenticated);
  const { setAuthenticated, abortActiveSSE } = useAppStore();
  const reduceMotion = useReducedMotion();

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  const headerClassName = "fixed top-0 left-0 right-0 z-50 pt-safe px-safe";

  const navContent = (
    <div className="mx-auto max-w-7xl px-2 xs:px-4 sm:px-6 py-3 sm:py-4">
      <nav className="flex items-center justify-between gap-1 sm:gap-2 rounded-2xl glass-card px-2 xs:px-4 sm:px-6 py-2.5 sm:py-3 overflow-hidden min-w-0">
        <Link to="/" className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
          </div>
          <span className="text-base sm:text-lg font-semibold truncate">DocuMind</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map(({ to, label }) => (
            <Link key={to} to={to} className="text-sm text-white hover:text-primary transition-colors">
              {label}
            </Link>
          ))}
        </div>
        <div className="flex md:hidden items-center gap-1 shrink-0">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="min-h-touch min-w-touch" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[280px] max-w-[85vw] pt-safe pb-safe flex flex-col">
              <div className="flex flex-col gap-1 pt-4">
                {NAV_LINKS.map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setMobileNavOpen(false)}
                    className="min-h-touch flex items-center px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors text-base"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
          {isAuthenticated ? (
            <>
              <Link to="/app">
                <Button variant="default" size="sm" className="min-h-touch text-xs sm:text-sm px-2.5 sm:px-3">
                  Documents
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </>
          ) : (
            <>
              <Link to="/login">
                <Button variant="ghost" size="sm" className="min-h-touch text-xs sm:text-sm px-2 sm:px-3 shrink-0">
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button variant="default" size="sm" className="min-h-touch text-xs sm:text-sm px-3 sm:px-4 whitespace-nowrap shrink-0 justify-center items-center inline-flex" title="Get Started">
                <span className="hidden min-[380px]:inline">Get Started</span>
                <span className="min-[380px]:hidden">Start</span>
              </Button>
              </Link>
            </>
          )}
        </div>
      </nav>
    </div>
  );

  return reduceMotion ? (
    <header className={headerClassName}>{navContent}</header>
  ) : (
    <motion.header
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={headerClassName}
    >
      {navContent}
    </motion.header>
  );
};

export default Navbar;
