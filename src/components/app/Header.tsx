import { Menu, Bell, Search, Settings, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppStore } from '@/stores/useAppStore';
import { useIsMobile } from '@/hooks/use-mobile';

interface HeaderProps {
  title?: string;
}

const Header = ({ title = 'Documents' }: HeaderProps) => {
  const isMobile = useIsMobile();
  const { toggleSidebar, setMobileMenuOpen, user, setAuthenticated, abortActiveSSE, documentSearchQuery, setDocumentSearchQuery } = useAppStore();

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  return (
    <header className="h-16 min-h-touch border-b border-border bg-background/95 backdrop-blur-lg flex items-center justify-between px-4 sm:px-6 pl-safe pr-safe sticky top-0 z-40 shrink-0">
      {/* Left section */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={isMobile ? () => setMobileMenuOpen(true) : toggleSidebar}
          className="md:hidden min-h-touch min-w-touch text-muted-foreground shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <h1 className="text-lg sm:text-xl font-semibold truncate">{title}</h1>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Search - hidden on small screens to save space */}
        <div className="hidden lg:flex relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search documents..."
            value={documentSearchQuery}
            onChange={(e) => setDocumentSearchQuery(e.target.value)}
            className="w-48 xl:w-64 pl-10 bg-secondary/50 border-border/50 focus:border-primary/50 min-h-10"
            aria-label="Search documents by name"
          />
        </div>

        {/* Notifications */}
        <Button variant="ghost" size="icon" className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground" aria-label="Notifications">
          <Bell className="w-5 h-5" />
        </Button>

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full min-h-touch min-w-touch md:min-h-0 md:min-w-0 w-9 h-9 md:w-9 md:h-9 p-0"
              aria-label="Account menu"
            >
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link to="/app/settings" className="flex items-center gap-2 cursor-pointer">
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
