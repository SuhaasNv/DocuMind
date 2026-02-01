import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

const Sidebar = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const { isSidebarOpen, toggleSidebar, setAuthenticated, abortActiveSSE, documents, documentSearchQuery, removeDocument, accessToken } = useAppStore();

  const recentDocuments = documentSearchQuery.trim()
    ? documents.filter((doc) =>
        doc.name.toLowerCase().includes(documentSearchQuery.trim().toLowerCase())
      ).slice(0, 5)
    : documents.slice(0, 5);

  const handleLogout = () => {
    abortActiveSSE?.();
    setAuthenticated(false, null, null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteDocId) return;
    const docId = deleteDocId;
    setDeleteDocId(null);
    if (accessToken) {
      try {
        await fetch(`${getApiBaseUrl()}/documents/${docId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Remove from UI anyway
      }
    }
    removeDocument(docId);
    if (pathname === `/chat/${docId}`) navigate('/app');
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: LayoutDashboard, label: 'Documents', path: '/app' },
    { icon: Settings, label: 'Settings', path: '/app/settings' },
  ];

  return (
    <motion.aside
      initial={false}
      animate={{ width: isSidebarOpen ? 280 : 72 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col"
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-sidebar-border gap-2">
        <AnimatePresence mode="wait">
          {isSidebarOpen ? (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="flex-1 min-w-0"
            >
              <Link to="/" className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4 text-primary" />
                </div>
                <span className="font-semibold text-foreground truncate">DocuMind</span>
              </Link>
            </motion.div>
          ) : (
            <Link to="/" className="flex items-center justify-center shrink-0" aria-label="DocuMind home">
              <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                <FileText className="w-4 h-4 text-primary" />
              </div>
            </Link>
          )}
        </AnimatePresence>

        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="text-muted-foreground hover:text-foreground"
        >
          {isSidebarOpen ? (
            <ChevronLeft className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Upload Button */}
      <div className="p-3">
        <Link to="/app">
          <Button
            variant="default"
            className={cn(
              'w-full justify-start gap-3',
              !isSidebarOpen && 'justify-center px-0'
            )}
          >
            <Plus className="w-4 h-4" />
            {isSidebarOpen && 'Upload Document'}
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
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground',
                    !isSidebarOpen && 'justify-center px-0'
                  )}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {isSidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Recent Documents */}
        {isSidebarOpen && recentDocuments.length > 0 && (
          <div className="mt-6">
            <h3 className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Recent Documents
            </h3>
            <ul className="space-y-1">
              {recentDocuments.map((doc) => {
                const isActive = pathname === `/chat/${doc.id}`;
                return (
                  <li key={doc.id}>
                    <div
                      className={cn(
                        'flex items-center gap-1 px-1 py-1 rounded-lg group',
                        isActive
                          ? 'bg-primary/20 border border-primary/30'
                          : 'hover:bg-sidebar-accent/50'
                      )}
                    >
                      <Link
                        to={`/chat/${doc.id}`}
                        className={cn(
                          'flex items-center gap-3 px-2 py-1.5 rounded-md flex-1 min-w-0 transition-colors',
                          isActive
                            ? 'text-primary'
                            : 'text-sidebar-foreground hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <FileText className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm truncate">{doc.name}</span>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDeleteDocId(doc.id);
                        }}
                        aria-label={`Delete ${doc.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </nav>

      {/* Delete confirmation */}
      <AlertDialog open={deleteDocId !== null} onOpenChange={(open) => !open && setDeleteDocId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the document from your list. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            'w-full justify-start gap-3 text-muted-foreground hover:text-foreground',
            !isSidebarOpen && 'justify-center px-0'
          )}
        >
          <LogOut className="w-4 h-4" />
          {isSidebarOpen && 'Log out'}
        </Button>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
