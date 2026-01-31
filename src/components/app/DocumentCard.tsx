import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, MessageSquare, Trash2, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
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
import { Document, DocumentStatus, useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

interface DocumentCardProps {
  document: Document;
}

const statusConfig: Record<DocumentStatus, {
  icon: typeof CheckCircle;
  label: string;
  className: string;
}> = {
  PENDING: {
    icon: Clock,
    label: 'Pending',
    className: 'status-pending',
  },
  PROCESSING: {
    icon: Loader2,
    label: 'Processing',
    className: 'status-processing',
  },
  DONE: {
    icon: CheckCircle,
    label: 'Ready',
    className: 'status-done',
  },
  FAILED: {
    icon: AlertTriangle,
    label: 'Failed',
    className: 'status-failed',
  },
};

const DocumentCard = ({ document }: DocumentCardProps) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const removeDocument = useAppStore((state) => state.removeDocument);
  const updateDocument = useAppStore((state) => state.updateDocument);
  const accessToken = useAppStore((state) => state.accessToken);
  const status = statusConfig[document.status];
  const StatusIcon = status.icon;

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    const base = getApiBaseUrl();
    if (!accessToken || !base) {
      toast.error('Not configured. Set VITE_API_URL and log in.');
      setDeleteDialogOpen(false);
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`${base}/documents/${document.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        let message = 'Failed to delete document';
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data.message === 'string') message = data.message;
        } catch {
          // ignore non-JSON body
        }
        toast.error(message);
        setIsDeleting(false);
        setDeleteDialogOpen(false);
        return;
      }
      removeDocument(document.id);
      setDeleteDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete document');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const base = getApiBaseUrl();
    if (!accessToken || !base) {
      toast.error('Not configured. Set VITE_API_URL and log in.');
      return;
    }
    setIsRetrying(true);
    try {
      const res = await fetch(`${base}/documents/${document.id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        let message = 'Failed to retry';
        try {
          const data = (await res.json()) as { message?: string };
          if (typeof data.message === 'string') message = data.message;
        } catch {
          // ignore non-JSON body
        }
        toast.error(message);
        setIsRetrying(false);
        return;
      }
      updateDocument(document.id, { status: 'PENDING', progress: 0 });
      toast.success('Retry started. The document will be processed again.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to retry');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      layout
      className="glass-card rounded-xl p-5 hover:border-primary/30 transition-all duration-300 group"
    >
      <div className="flex items-start gap-4">
        {/* File icon */}
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-6 h-6 text-primary" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-medium truncate">{document.name}</h3>
            <span className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-mobile-safe font-medium whitespace-nowrap min-[640px]:text-xs',
              status.className
            )}>
              <StatusIcon className={cn(
                'w-3 h-3',
                document.status === 'PROCESSING' && 'animate-spin'
              )} />
              {status.label}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mb-3">
            Uploaded {formatDistanceToNow(document.uploadedAt, { addSuffix: true })}
          </p>

          {/* Progress bar */}
          {(document.status === 'PROCESSING' || document.status === 'PENDING') && (
            <div className="mb-4">
              <div className="progress-bar">
                <motion.div
                  className="progress-bar-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${document.progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {document.progress < 30 && 'Uploading...'}
                {document.progress >= 30 && document.progress < 70 && 'Processing document...'}
                {document.progress >= 70 && document.progress < 100 && 'Finalizing...'}
                {document.progress === 100 && 'Complete'}
              </p>
            </div>
          )}

          {/* Actions - touch-friendly on mobile */}
          <div className="flex flex-wrap items-center gap-2">
            {document.status === 'DONE' && (
              <Link to={`/chat/${document.id}`}>
                <Button variant="default" size="sm" className="min-h-touch">
                  <MessageSquare className="w-4 h-4 mr-1.5 shrink-0" />
                  Chat
                </Button>
              </Link>
            )}
            {document.status === 'FAILED' && (
              <Button variant="outline" size="sm" onClick={handleRetry} disabled={isRetrying} className="min-h-touch">
                {isRetrying ? 'Retrying...' : 'Retry'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDeleteClick}
              className="min-h-touch min-w-touch md:min-h-0 md:min-w-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
              aria-label="Delete document"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{document.name}&quot;. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
};

export default DocumentCard;
