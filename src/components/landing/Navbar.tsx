import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  LogOut,
  Menu,
  Zap,
  DollarSign,
  HelpCircle,
  BookOpen,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TubelightNav } from '@/components/ui/tubelight-navbar';
import { useAppStore } from '@/stores/useAppStore';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const NAV_ITEMS = [
  { name: 'Features',     url: '/features',     icon: Zap },
  { name: 'Pricing',      url: '/pricing',      icon: DollarSign },
  { name: 'How it works', url: '/how-it-works', icon: HelpCircle },
  { name: 'Docs',         url: '/docs',         icon: BookOpen },
  { name: 'About',        url: '/about',        icon: Info },
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

  const entranceClass = reduceMotion ? '' : 'animate-navbar-slide-in';

  return (
    /* mx-4 keeps 16 px breathing room on the narrowest phones */
    <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[calc(100vw-2rem)] ${entranceClass}`}>
      <nav className="flex items-center gap-1 px-2 py-1.5 rounded-full border border-white/10 bg-black/70 backdrop-blur-xl shadow-lg shadow-black/40">

        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 pl-2 pr-3 shrink-0 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-white hidden sm:block truncate">DocuMind</span>
        </Link>

        {/* Desktop divider */}
        <span className="hidden md:block w-px h-5 bg-white/10 mx-1 shrink-0" />

        {/* Tubelight nav — desktop only */}
        <TubelightNav items={NAV_ITEMS} className="hidden md:flex" />

        {/* Desktop divider */}
        <span className="hidden md:block w-px h-5 bg-white/10 mx-1 shrink-0" />

        {/* Auth buttons */}
        <div className="flex items-center gap-1 px-1 shrink-0">
          {isAuthenticated ? (
            <>
              <Link to="/app">
                <Button size="sm" className="rounded-full text-xs px-3 h-8">
                  Dashboard
                </Button>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                className="rounded-full w-8 h-8 text-white/60 hover:text-white"
                aria-label="Log out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </>
          ) : (
            <>
              {/* "Log in" hidden on xs so pill stays compact */}
              <Link to="/login" className="hidden xs:block">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs px-3 h-8 text-white/70 hover:text-white hover:bg-white/10"
                >
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button
                  size="sm"
                  className="rounded-full text-xs px-3 h-8 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold whitespace-nowrap"
                >
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Hamburger — mobile only */}
        <div className="flex md:hidden pl-0.5 shrink-0">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full w-8 h-8 text-white/70 hover:text-white hover:bg-white/10"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[280px] max-w-[85vw] flex flex-col pt-10 pb-safe">
              {/* Branding inside drawer */}
              <div className="flex items-center gap-2 px-2 mb-6">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <span className="text-base font-semibold">DocuMind</span>
              </div>

              <nav className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ name, url, icon: Icon }) => (
                  <Link
                    key={url}
                    to={url}
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors text-sm font-medium active:scale-[0.98]"
                  >
                    <Icon size={16} className="text-primary shrink-0" />
                    {name}
                  </Link>
                ))}
              </nav>

              {/* Auth at bottom of drawer */}
              <div className="mt-auto flex flex-col gap-2 pt-6 border-t border-border/40">
                {isAuthenticated ? (
                  <>
                    <Link to="/app" onClick={() => setMobileNavOpen(false)}>
                      <Button className="w-full rounded-xl" size="lg">Dashboard</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      className="w-full rounded-xl text-muted-foreground"
                      onClick={() => { handleLogout(); setMobileNavOpen(false); }}
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Link to="/register" onClick={() => setMobileNavOpen(false)}>
                      <Button className="w-full rounded-xl" size="lg">Get Started Free</Button>
                    </Link>
                    <Link to="/login" onClick={() => setMobileNavOpen(false)}>
                      <Button variant="outline" className="w-full rounded-xl" size="lg">Log in</Button>
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>

      </nav>
    </div>
  );
};

export default Navbar;
