import { useState, useEffect } from 'react';
import { Menu, Bell, Search, Settings, LogOut, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppStore } from '@/stores/useAppStore';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title?: string;
}

const Header = ({ title = 'Documents' }: HeaderProps) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const isMobile = useIsMobile();
  const {
    toggleSidebar,
    setMobileMenuOpen,
    user,
    setAuthenticated,
    abortActiveSSE,
    documentSearchQuery,
    setDocumentSearchQuery,
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications,
  } = useAppStore();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search-docs')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
            id="search-docs"
            type="search"
            placeholder="Search documents... (Cmd+K)"
            value={documentSearchQuery}
            onChange={(e) => setDocumentSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur();
                setDocumentSearchQuery('');
              }
            }}
            className="w-48 xl:w-64 pl-10 bg-secondary/50 border-border/50 focus:border-primary/50 min-h-10 transition-all focus:w-64 xl:focus:w-80"
            aria-label="Search documents by name"
          />
        </div>
      </div>

      {/* Notifications */}
      <Popover open={notifOpen} onOpenChange={setNotifOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground"
            aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary hover:text-primary"
                  onClick={() => markAllNotificationsRead()}
                >
                  Mark all read
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    clearNotifications();
                    setNotifOpen(false);
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                No notifications yet. When a document finishes processing, it will appear here.
              </p>
            ) : (
              <ul className="py-1">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={`/chat/${n.documentId}`}
                      onClick={() => {
                        markNotificationRead(n.id);
                        setNotifOpen(false);
                      }}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        !n.read && 'bg-primary/5'
                      )}
                    >
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
                        <FileText className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={cn('text-sm font-medium', !n.read && 'text-primary')}>
                          Document ready
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{n.documentName}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PopoverContent>
      </Popover>

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
    </header>
  );
};

export default Header;
