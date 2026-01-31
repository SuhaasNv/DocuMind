import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { FileText, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAppStore } from '@/stores/useAppStore';

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

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 pt-safe px-safe"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4">
        <nav className="flex items-center justify-between rounded-2xl glass-card px-4 sm:px-6 py-3 overflow-hidden">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-semibold">DocuMind</span>
          </Link>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(({ to, label }) => (
              <Link key={to} to={to} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                {label}
              </Link>
            ))}
          </div>

          {/* Mobile: hamburger + sheet with nav links */}
          <div className="flex md:hidden items-center gap-2">
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

          {/* Auth Buttons - touch targets on mobile; hide on mobile when sheet is used (auth stays visible) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {isAuthenticated ? (
              <>
                <Link to="/app">
                  <Button variant="default" size="sm" className="min-h-touch">
                    Documents
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground hover:text-foreground"
                  aria-label="Log out"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm" className="min-h-touch">
                    Log in
                  </Button>
                </Link>
                <Link to="/register">
                  <Button variant="default" size="sm" className="min-h-touch">
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </motion.header>
  );
};

export default Navbar;
