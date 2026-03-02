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
  { name: 'Features',    url: '/features',     icon: Zap },
  { name: 'Pricing',     url: '/pricing',      icon: DollarSign },
  { name: 'How it works',url: '/how-it-works', icon: HelpCircle },
  { name: 'Docs',        url: '/docs',         icon: BookOpen },
  { name: 'About',       url: '/about',        icon: Info },
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
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 w-max ${entranceClass}`}>
      <nav className="flex items-center gap-1 px-2 py-2 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl shadow-lg shadow-black/40">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 pl-2 pr-4 shrink-0"
        >
          <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="text-sm font-semibold text-white hidden sm:block">
            DocuMind
          </span>
        </Link>

        {/* Divider */}
        <span className="hidden md:block w-px h-5 bg-white/10 mx-1" />

        {/* Tubelight nav links — desktop */}
        <TubelightNav items={NAV_ITEMS} className="hidden md:flex" />

        {/* Divider */}
        <span className="hidden md:block w-px h-5 bg-white/10 mx-1" />

        {/* Auth buttons */}
        <div className="flex items-center gap-1 pl-1 pr-1">
          {isAuthenticated ? (
            <>
              <Link to="/app">
                <Button
                  size="sm"
                  className="rounded-full text-xs px-4 h-8"
                >
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
              <Link to="/login">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-xs px-4 h-8 text-white/70 hover:text-white hover:bg-white/10"
                >
                  Log in
                </Button>
              </Link>
              <Link to="/register">
                <Button
                  size="sm"
                  className="rounded-full text-xs px-4 h-8 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="flex md:hidden pl-1">
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
            <SheetContent side="right" className="w-[260px] flex flex-col pt-10">
              <div className="flex flex-col gap-1">
                {NAV_ITEMS.map(({ name, url, icon: Icon }) => (
                  <Link
                    key={url}
                    to={url}
                    onClick={() => setMobileNavOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary transition-colors text-sm"
                  >
                    <Icon size={16} />
                    {name}
                  </Link>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  );
};

export default Navbar;
