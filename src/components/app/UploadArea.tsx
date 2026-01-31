import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';
import type { Document } from '@/stores/useAppStore';

/** Backend document response shape (matches DocumentResponseDto). */
interface ApiDocument {
  id: string;
  name: string;
  uploadedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  size?: number;
}

const POLL_INTERVAL_MS = 2000;

const UploadArea = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { addDocument, updateDocument, setUploading, isUploading, accessToken } = useAppStore();
  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

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

  const toStoreDocument = (d: ApiDocument): Document => ({
    id: d.id,
    name: d.name,
    uploadedAt: new Date(d.uploadedAt),
    status: d.status,
    progress: d.progress,
    size: d.size,
  });

  const pollDocumentStatus = useCallback((docId: string) => {
    if (pollRef.current[docId]) return;
    const token = useAppStore.getState().accessToken;
    if (!token) return;

    const base = getApiBaseUrl();
    if (!base) return;
    const poll = async () => {
      try {
        const res = await fetch(`${base}/documents/${docId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as ApiDocument;
        useAppStore.getState().updateDocument(docId, {
          status: data.status,
          progress: data.progress,
        });
        if (data.status === 'DONE' || data.status === 'FAILED') {
          if (pollRef.current[docId]) {
            clearInterval(pollRef.current[docId]);
            delete pollRef.current[docId];
          }
        }
      } catch {
        // ignore network errors; will retry next interval
      }
    };

    poll();
    pollRef.current[docId] = setInterval(poll, POLL_INTERVAL_MS);
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pollRef.current).forEach((id) => clearInterval(id));
      pollRef.current = {};
    };
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const pdfFiles = files.filter((file) => file.type === 'application/pdf');
      if (pdfFiles.length === 0) {
        setUploadError('Only PDF files are supported. Please select a PDF to upload.');
        return;
      }
      if (!accessToken) {
        setUploadError('Sign in to upload documents.');
        return;
      }
      const base = getApiBaseUrl();
      if (!base) {
        setUploadError('Backend URL is not configured. Add VITE_API_URL to .env and restart the dev server.');
        return;
      }

      setUploadError(null);
      setUploading(true);

      for (const file of pdfFiles) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`${base}/documents/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: formData,
          });
          const data = (await res.json()) as ApiDocument | { message?: string; statusCode?: number };
          if (!res.ok) {
            const msg = typeof (data as { message?: string }).message === 'string'
              ? (data as { message: string }).message
              : 'Upload failed';
            setUploadError(msg);
            continue;
          }
          const doc = toStoreDocument(data as ApiDocument);
          addDocument(doc);
          pollDocumentStatus(doc.id);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed. Check your connection and try again.');
        }
      }

      setUploading(false);
    },
    [accessToken, addDocument, setUploading, pollDocumentStatus],
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
            'relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center transition-all duration-300',
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
            <Upload className="w-8 h-8 text-primary" />
          </motion.div>

          <h3 className="text-lg sm:text-xl font-semibold mb-2">
            {isDragOver ? 'Drop your PDF here' : 'Upload a document'}
          </h3>
          <p className="text-muted-foreground text-mobile-safe mb-6">
            Drag and drop your PDF file, or click to browse
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

          <p className="mt-4 text-mobile-safe text-muted-foreground">
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
