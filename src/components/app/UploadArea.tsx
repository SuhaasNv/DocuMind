import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl, getApiErrorMessage } from '@/lib/api';
import {
  checkSessionExpired,
  ERROR_MESSAGES,
  UPLOAD_STATUS,
} from '@/lib/errorMessages';
import {
  toStoreDocument,
  useInvalidateDocuments,
  type ApiDocument,
} from '@/hooks/useDocumentsQuery';

const UploadArea = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { addDocument, setUploading, isUploading, accessToken } = useAppStore();
  const invalidateDocuments = useInvalidateDocuments();

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleFiles(files);
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdfFiles = files.filter((file) => file.type === 'application/pdf');
      if (pdfFiles.length === 0) {
        setUploadError(ERROR_MESSAGES.notAPdf);
        return;
      }
      if (!accessToken) {
        setUploadError('Please sign in to upload documents.');
        return;
      }

      setUploadError(null);
      setUploading(true);
      let anyUploaded = false;

      for (const file of pdfFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`${getApiBaseUrl()}/documents/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          });
          if (!res.ok) {
            checkSessionExpired(res);
            const data = (await res.json().catch(() => ({}))) as { message?: string };
            setUploadError(
              typeof data.message === 'string' ? data.message : ERROR_MESSAGES.uploadFailed,
            );
            continue;
          }
          // 201: the row is created and the processing job is queued — the
          // user can safely leave now.
          const doc = toStoreDocument((await res.json()) as ApiDocument);
          addDocument(doc);
          anyUploaded = true;
        } catch (err) {
          setUploadError(getApiErrorMessage(err, ERROR_MESSAGES.uploadFailed));
        }
      }

      setUploading(false);
      if (anyUploaded) {
        toast.success(UPLOAD_STATUS.safeToLeave);
      }
      // The documents query re-polls while anything is PENDING/PROCESSING.
      invalidateDocuments();
    },
    [accessToken, addDocument, setUploading, invalidateDocuments],
  );

  return (
    <div className="mb-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300',
            isDragOver
              ? 'border-primary bg-primary/5'
              : 'border-border/50 hover:border-primary/50 hover:bg-card/50',
            isUploading && 'pointer-events-none opacity-60'
          )}
        >
          <motion.div
            animate={{ y: isDragOver ? -10 : 0, scale: isDragOver ? 1.1 : 1 }}
            transition={{ duration: 0.2 }}
            className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6"
          >
            {isUploading ? (
              <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="w-8 h-8 text-primary" />
            )}
          </motion.div>

          <h3 className="text-xl font-semibold mb-2">
            {isUploading
              ? 'Uploading your PDF'
              : isDragOver
                ? 'Drop your PDF here'
                : 'Upload a document'}
          </h3>
          <p className="text-muted-foreground mb-6" role="status">
            {isUploading
              ? UPLOAD_STATUS.keepTabOpen
              : 'Drag and drop your PDF file, or click to browse'}
          </p>

          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={handleFileInput}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />

          <Button variant="secondary" className="pointer-events-none">
            <FileText className="w-4 h-4 mr-2" />
            Choose PDF
          </Button>

          <p className="mt-4 text-xs text-muted-foreground">
            Supports PDF files up to 50MB
          </p>
        </div>
      </motion.div>

      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: -10 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-4 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{uploadError}</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setUploadError(null)}
              aria-label="Dismiss error"
              className="text-destructive hover:bg-destructive/20 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UploadArea;
