import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Loader2,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useAppStore } from '@/stores/useAppStore';
import { getApiBaseUrl, getApiErrorMessage } from '@/lib/api';
import {
  checkSessionExpired,
  ERROR_MESSAGES,
  UPLOAD_STATUS,
} from '@/lib/errorMessages';
import { createCollection, addDocumentToCollection } from '@/lib/collections';
import {
  runBatchUpload,
  suggestCollectionName,
  type BatchFileState,
} from '@/lib/batchUpload';
import {
  toStoreDocument,
  useInvalidateDocuments,
  type ApiDocument,
} from '@/hooks/useDocumentsQuery';

/** Matches the server's real per-file cap (documents.controller.ts MAX_SIZE / FileInterceptor limits). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
/** Matches the server's upload throttle (15 requests/60s) so a full batch
 * can't reliably trip its own rate limit — see documents.controller.ts UPLOAD_THROTTLE. */
const MAX_BATCH_FILES = 15;
/** Bounded concurrency for batch uploads — never Promise.all over the whole set. */
const BATCH_CONCURRENCY = 3;

type BatchFileRow = BatchFileState & { file: File };

interface Batch {
  collectionId: string;
  collectionName: string;
  files: BatchFileRow[];
}

const UploadArea = () => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { addDocument, setUploading, isUploading, accessToken, upsertCollection } = useAppStore();
  const invalidateDocuments = useInvalidateDocuments();

  // Grouping prompt (shown when >1 PDF is selected/dropped).
  const [pendingGroupFiles, setPendingGroupFiles] = useState<File[] | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  // Live batch-upload progress panel.
  const [batch, setBatch] = useState<Batch | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    void handleFiles(files);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    void handleFiles(files);
  }, []);

  /** The original sequential, one-POST-per-file upload loop — unchanged
   * behavior. Used for a single file AND for "upload without grouping". */
  const uploadLoose = useCallback(
    async (files: File[]) => {
      setUploading(true);
      let anyUploaded = false;

      for (const file of files) {
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

  /** POST a single file. Client-side size precheck matches the server's real
   * 50MB cap so an obviously-oversized file fails without a wasted request. */
  const uploadFile = useCallback(
    async (file: File): Promise<ReturnType<typeof toStoreDocument>> => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(ERROR_MESSAGES.pdfTooLarge);
      }
      if (!accessToken) {
        throw new Error('Please sign in to upload documents.');
      }
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
        throw new Error(
          typeof data.message === 'string' ? data.message : ERROR_MESSAGES.uploadFailed,
        );
      }
      return toStoreDocument((await res.json()) as ApiDocument);
    },
    [accessToken],
  );

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

      if (pdfFiles.length > 1) {
        setPendingGroupFiles(pdfFiles);
        setGroupName(suggestCollectionName(pdfFiles));
        setGroupError(null);
        setGroupDialogOpen(true);
        return;
      }

      await uploadLoose(pdfFiles);
    },
    [accessToken, uploadLoose],
  );

  const patchBatchFile = useCallback((index: number, patch: Partial<BatchFileState>) => {
    if (!mountedRef.current) return;
    setBatch((prev) => {
      if (!prev) return prev;
      const files = [...prev.files];
      files[index] = { ...files[index], ...patch };
      return { ...prev, files };
    });
  }, []);

  const handleCreateGroup = async () => {
    if (!pendingGroupFiles || !accessToken) return;
    const files = pendingGroupFiles;
    const name = groupName.trim() || suggestCollectionName(files);

    setGroupBusy(true);
    setGroupError(null);
    // Collection created FIRST: a mid-run failure leaves a usable partial
    // collection rather than orphaned, ungrouped documents.
    let created;
    try {
      created = await createCollection(accessToken, name);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : 'Could not create collection');
      setGroupBusy(false);
      return;
    }
    upsertCollection(created);
    setGroupBusy(false);
    setGroupDialogOpen(false);
    setPendingGroupFiles(null);

    setBatch({
      collectionId: created.id,
      collectionName: created.name,
      files: files.map((file) => ({ file, status: 'queued' as const })),
    });
    setUploading(true);
    try {
      await runBatchUpload(files, {
        concurrency: BATCH_CONCURRENCY,
        uploadOne: async (file) => {
          const doc = await uploadFile(file);
          addDocument(doc);
          // Incremental invalidation as each document lands — the existing
          // poller (useDocumentsQuery) then picks up its PENDING/PROCESSING
          // status without a second progress channel.
          invalidateDocuments();
          return doc;
        },
        attachOne: async (documentId) => {
          const updated = await addDocumentToCollection(accessToken, created.id, documentId);
          upsertCollection(updated);
        },
        onUpdate: patchBatchFile,
      });
    } finally {
      setUploading(false);
      invalidateDocuments();
    }
  };

  const retryBatchFile = async (index: number) => {
    if (!batch || !accessToken) return;
    const row = batch.files[index];
    patchBatchFile(index, { status: 'uploading', error: undefined });
    try {
      const doc = await uploadFile(row.file);
      addDocument(doc);
      invalidateDocuments();
      try {
        const updated = await addDocumentToCollection(accessToken, batch.collectionId, doc.id);
        upsertCollection(updated);
      } catch {
        // Uploaded fine; grouping failed — still a successful upload.
      }
      patchBatchFile(index, { status: 'done', documentId: doc.id });
    } catch (err) {
      patchBatchFile(index, {
        status: 'failed',
        error: getApiErrorMessage(err, ERROR_MESSAGES.uploadFailed),
      });
    }
  };

  const batchCounts = useMemo(() => {
    if (!batch) return { done: 0, failed: 0, total: 0 };
    return {
      done: batch.files.filter((f) => f.status === 'done').length,
      failed: batch.files.filter((f) => f.status === 'failed').length,
      total: batch.files.length,
    };
  }, [batch]);

  const overBatchLimit = (pendingGroupFiles?.length ?? 0) > MAX_BATCH_FILES;

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
            Supports PDF files up to 50MB. Select more than one to group them into a collection.
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

      {/* Batch upload progress — visible for the life of the batch; dismissible. */}
      <AnimatePresence>
        {batch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="mt-4 glass-card rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  Uploading to &quot;{batch.collectionName}&quot;
                </p>
                <p className="text-xs text-muted-foreground" role="status">
                  {batchCounts.done} of {batchCounts.total} uploaded
                  {batchCounts.failed > 0 && (
                    <span className="text-destructive"> · {batchCounts.failed} failed</span>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setBatch(null)}
                aria-label="Dismiss upload progress"
                className="shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <ul className="space-y-1.5 max-h-56 overflow-y-auto -mx-1 px-1">
              {batch.files.map((row, i) => (
                <li key={`${row.file.name}-${i}`} className="flex items-center gap-2 text-sm">
                  {row.status === 'queued' && (
                    <Clock className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                  )}
                  {row.status === 'uploading' && (
                    <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" aria-hidden="true" />
                  )}
                  {row.status === 'done' && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
                  )}
                  {row.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-destructive shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate flex-1 min-w-0">{row.file.name}</span>
                  {row.status === 'failed' && (
                    <>
                      <span
                        className="hidden sm:block text-xs text-destructive truncate max-w-[160px]"
                        title={row.error}
                      >
                        {row.error}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs shrink-0"
                        onClick={() => void retryBatchFile(i)}
                      >
                        Retry
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grouping prompt — shown when >1 PDF is selected/dropped. */}
      <Dialog
        open={groupDialogOpen}
        onOpenChange={(open) => {
          if (groupBusy) return;
          setGroupDialogOpen(open);
          if (!open) setPendingGroupFiles(null);
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Group these into a collection?</DialogTitle>
            <DialogDescription>
              {pendingGroupFiles?.length ?? 0} PDFs selected. Upload them together as a named
              collection so you can chat across all of them, or upload them separately.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Collection name"
            maxLength={120}
            autoFocus
            disabled={groupBusy}
          />
          {overBatchLimit && (
            <p className="mt-2 text-xs text-destructive">
              Batches are limited to {MAX_BATCH_FILES} files at a time. Choose fewer files, or
              upload without grouping.
            </p>
          )}
          {groupError && <p className="mt-2 text-xs text-destructive">{groupError}</p>}
          <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={groupBusy}
              onClick={() => {
                const files = pendingGroupFiles;
                setGroupDialogOpen(false);
                setPendingGroupFiles(null);
                if (files) void uploadLoose(files);
              }}
            >
              Upload without grouping
            </Button>
            <Button
              type="button"
              disabled={groupBusy || !pendingGroupFiles || overBatchLimit}
              onClick={() => void handleCreateGroup()}
            >
              {groupBusy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create collection &amp; upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UploadArea;
