import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, MessageSquare, Trash2, Clock, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  const removeDocument = useAppStore((state) => state.removeDocument);
  const accessToken = useAppStore((state) => state.accessToken);
  const status = statusConfig[document.status];
  const StatusIcon = status.icon;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = async () => {
    setShowDeleteConfirm(false);
    if (accessToken) {
      try {
        await fetch(`${getApiBaseUrl()}/documents/${document.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch {
        // Remove from UI anyway; backend may be unreachable
      }
    }
    removeDocument(document.id);
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
              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
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

          {/* Actions */}
          <div className="flex items-center gap-2">
            {document.status === 'DONE' && (
              <Link to={`/chat/${document.id}`}>
                <Button variant="default" size="sm">
                  <MessageSquare className="w-4 h-4 mr-1.5" />
                  Chat
                </Button>
              </Link>
            )}
            {document.status === 'FAILED' && (
              <Button variant="outline" size="sm">
                Retry
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteClick}
              className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &quot;{document.name}&quot; from your list. This action cannot be undone.
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
    </motion.div>
  );
};

export default DocumentCard;
