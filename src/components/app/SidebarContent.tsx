import { Link, useLocation } from 'react-router-dom';
import {
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  LogOut,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/useAppStore';

interface SidebarContentProps {
  /** When true, show labels next to icons. When false, icons only (collapsed). */
  isExpanded: boolean;
  /** Called when a link/action is used (e.g. close mobile sheet). */
  onLinkClick?: () => void;
  /** When true, render for mobile sheet: no collapse, full labels, touch-friendly. */
  isMobileSheet?: boolean;
  /** When true, show logo + app name at top (e.g. in mobile sheet). */
  showLogo?: boolean;
}

const SidebarContent = ({ isExpanded, onLinkClick, isMobileSheet = false, showLogo = false }: SidebarContentProps) => {
  const location = useLocation();
  const { setAuthenticated, abortActiveSSE, documents, documentSearchQuery } = useAppStore();

  const recentDocuments = documentSearchQuery.trim()
    ? documents.filter((doc) =>
        doc.name.toLowerCase().includes(documentSearchQuery.trim().toLowerCase())
      ).slice(0, 5)
    : documents.slice(0, 5);

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
    onLinkClick?.();
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: LayoutDashboard, label: 'Documents', path: '/app' },
    { icon: Settings, label: 'Settings', path: '/app/settings' },
  ];

  const linkClass = cn(
    'flex items-center gap-3 rounded-lg transition-colors min-h-touch min-w-touch md:min-h-0 md:min-w-0',
    isMobileSheet ? 'px-4 py-3 text-base' : 'px-3 py-2.5'
  );

  return (
    <>
      {/* Logo at top (mobile sheet only, or when showLogo) */}
      {(showLogo || isMobileSheet) && (
        <div className="flex items-center gap-2 px-4 pt-safe pb-2 border-b border-sidebar-border shrink-0">
          <Link to="/" className="flex items-center gap-2" onClick={onLinkClick}>
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">DocuMind</span>
          </Link>
        </div>
      )}

      {/* Upload Button */}
      <div className={isMobileSheet ? 'p-4' : 'p-3'}>
        <Link to="/app" onClick={onLinkClick}>
          <Button
            variant="default"
            className={cn(
              'w-full justify-start gap-3 min-h-touch md:min-h-0',
              !isExpanded && !isMobileSheet && 'justify-center px-0'
            )}
          >
            <Plus className="w-5 h-5 shrink-0" />
            {(isExpanded || isMobileSheet) && 'Upload Document'}
          </Button>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={onLinkClick}
                  className={cn(
                    linkClass,
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground active:bg-sidebar-accent/70',
                    !isExpanded && !isMobileSheet && 'justify-center px-0'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {(isExpanded || isMobileSheet) && (
                    <span className={cn('font-medium', isMobileSheet ? 'text-base' : 'text-sm')}>
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Recent Documents */}
        {(isExpanded || isMobileSheet) && recentDocuments.length > 0 && (
          <div className="mt-6">
            <h3 className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Documents
            </h3>
            <ul className="space-y-1">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to={`/chat/${doc.id}`}
                    onClick={onLinkClick}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-colors min-h-touch md:min-h-0',
                      isMobileSheet && 'py-3 text-sm'
                    )}
                  >
                    <FileText className="w-4 h-4 flex-shrink-0" />
                    <span className={cn('truncate', isMobileSheet ? 'text-base' : 'text-sm')}>
                      {doc.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* Footer / Logout */}
      <div className={cn('border-t border-sidebar-border p-3 pb-safe', isMobileSheet && 'pb-4')}>
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start gap-3 text-muted-foreground hover:text-foreground min-h-touch md:min-h-0',
            !isExpanded && !isMobileSheet && 'justify-center px-0'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {(isExpanded || isMobileSheet) && 'Log out'}
        </Button>
      </div>
    </>
  );
};

export default SidebarContent;
