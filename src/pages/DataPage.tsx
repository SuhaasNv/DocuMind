import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import Header from '@/components/app/Header';
import { EmptyDocuments, EmptySearch } from '@/components/app/EmptyStates';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { cn } from '@/lib/utils';
import { ERROR_MESSAGES, checkSessionExpired } from '@/lib/errorMessages';
import { getApiBaseUrl, getApiErrorMessage } from '@/lib/api';
import { downloadDocument } from '@/lib/downloadDocument';
import { formatFileSize } from '@/lib/format';
import { useAppStore, type Document, type DocumentStatus } from '@/stores/useAppStore';
import { useDocumentsQuery, useInvalidateDocuments } from '@/hooks/useDocumentsQuery';
import {
  STATUS_FILTERS,
  matchesStatus,
  sortDocuments,
  type SortKey,
  type StatusFilter,
} from './Dashboard';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const statusBadge: Record<DocumentStatus, { icon: typeof CheckCircle; label: string; className: string }> = {
  PENDING: { icon: Clock, label: 'Pending', className: 'status-pending' },
  PROCESSING: { icon: Loader2, label: 'Processing', className: 'status-processing' },
  DONE: { icon: CheckCircle, label: 'Ready', className: 'status-done' },
  FAILED: { icon: AlertTriangle, label: 'Failed', className: 'status-failed' },
};

const RowSkeleton = () => (
  <TableRow>
    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-12" /></TableCell>
    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-8" /></TableCell>
    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
    <TableCell><Skeleton className="h-8 w-24" /></TableCell>
  </TableRow>
);

/**
 * Dense tabular view of every owned document — the "Data Management" tab.
 * Reuses useDocumentsQuery (same poller/cache as Dashboard) and the same
 * status/sort semantics; adds per-row Download/Chat/Retry/Delete actions.
 */
const DataPage = () => {
  const documents = useAppStore((s) => s.documents);
  const collections = useAppStore((s) => s.collections);
  const accessToken = useAppStore((s) => s.accessToken);
  const removeDocument = useAppStore((s) => s.removeDocument);
  const updateDocument = useAppStore((s) => s.updateDocument);
  const invalidateDocuments = useInvalidateDocuments();

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useDocumentsQuery();
  const total = data?.pages[0]?.total ?? documents.length;

  const [sort, setSort] = useState<SortKey>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [nameFilter, setNameFilter] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Collection membership per document, derived from the collections already
  // loaded into the store (CollectionsSection fetches these) — no new query.
  const collectionNamesByDoc = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const collection of collections) {
      for (const doc of collection.documents) {
        const names = map.get(doc.id) ?? [];
        names.push(collection.name);
        map.set(doc.id, names);
      }
    }
    return map;
  }, [collections]);

  const search = nameFilter.trim().toLowerCase();
  const filteredDocuments = sortDocuments(
    documents.filter(
      (doc) =>
        matchesStatus(doc, statusFilter) &&
        (!search || doc.name.toLowerCase().includes(search)),
    ),
    sort,
  );
  const isFiltered = Boolean(search) || statusFilter !== 'ALL';

  const handleDownload = async (doc: Document) => {
    if (!accessToken || downloadingId) return;
    setDownloadingId(doc.id);
    try {
      await downloadDocument(accessToken, doc.id, doc.name);
    } catch (err) {
      toast.error("Couldn't download this document", {
        description: getApiErrorMessage(err, ERROR_MESSAGES.genericRetry),
      });
    } finally {
      setDownloadingId(null);
    }
  };

  // Same FAILED->PENDING retry flow as DocumentCard: atomic backend claim,
  // optimistic update, revert + toast on failure, in-flight disable.
  const handleRetry = async (doc: Document) => {
    if (!accessToken || retryingId) return;
    setRetryingId(doc.id);
    try {
      updateDocument(doc.id, { status: 'PENDING', progress: 0 });
      const res = await fetch(`${getApiBaseUrl()}/documents/${doc.id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        updateDocument(doc.id, { status: 'FAILED' });
        checkSessionExpired(res);
        toast.error("Couldn't restart processing", { description: ERROR_MESSAGES.genericRetry });
      } else {
        invalidateDocuments();
      }
    } catch {
      updateDocument(doc.id, { status: 'FAILED' });
      toast.error("Couldn't restart processing", { description: ERROR_MESSAGES.genericRetry });
    } finally {
      setRetryingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId || !accessToken) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        checkSessionExpired(res);
        throw new Error(`Delete failed (${res.status})`);
      }
      removeDocument(id);
      invalidateDocuments();
    } catch (err) {
      toast.error("Couldn't delete this document", {
        description: getApiErrorMessage(err, ERROR_MESSAGES.genericRetry),
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Data" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Data Management</h2>
            <span className="text-sm text-muted-foreground">
              {isFiltered
                ? `${filteredDocuments.length} of ${total} ${total === 1 ? 'document' : 'documents'}`
                : `${total} ${total === 1 ? 'document' : 'documents'}`}
            </span>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Filter by name…"
              aria-label="Filter documents by name"
              className="flex h-9 w-full sm:max-w-xs rounded-md border border-border/50 bg-secondary/50 px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-[150px] h-9" aria-label="Sort documents">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="size">Size</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1 sm:ml-auto">
              {STATUS_FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  aria-pressed={statusFilter === key}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    statusFilter === key
                      ? 'bg-primary/15 border-primary/40 text-primary'
                      : 'bg-secondary/50 border-border/50 text-muted-foreground hover:text-foreground hover:border-border',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {isLoading && documents.length === 0 ? (
            <div className="glass-card rounded-xl overflow-hidden">
              <Table>
                <TableBody>
                  <RowSkeleton />
                  <RowSkeleton />
                  <RowSkeleton />
                </TableBody>
              </Table>
            </div>
          ) : isError && documents.length === 0 ? (
            <div className="glass-card rounded-xl p-8 text-center">
              <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Couldn't load your documents</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {ERROR_MESSAGES.networkUnreachable}
              </p>
              <Button variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : filteredDocuments.length === 0 ? (
            isFiltered ? <EmptySearch /> : <EmptyDocuments />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="glass-card rounded-xl overflow-hidden"
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Size</TableHead>
                    <TableHead className="hidden md:table-cell">Pages</TableHead>
                    <TableHead className="hidden md:table-cell">Chunks</TableHead>
                    <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                    <TableHead className="hidden lg:table-cell">Collections</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => {
                    const status = statusBadge[doc.status];
                    const StatusIcon = status.icon;
                    const collectionNames = collectionNamesByDoc.get(doc.id) ?? [];
                    const canDownload = doc.hasFile !== false;
                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="max-w-[220px]">
                          <span className="block truncate font-medium" title={doc.name}>
                            {doc.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap',
                              status.className,
                            )}
                          >
                            <StatusIcon
                              className={cn('w-3 h-3', doc.status === 'PROCESSING' && 'animate-spin')}
                            />
                            {status.label}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground tabular-nums">
                          {formatFileSize(doc.size) || '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                          {doc.pageCount ?? '-'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">
                          {doc.chunkCount ?? '-'}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                          {formatDistanceToNow(doc.uploadedAt, { addSuffix: true })}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground max-w-[160px]">
                          {collectionNames.length > 0 ? (
                            <span className="truncate block" title={collectionNames.join(', ')}>
                              {collectionNames.join(', ')}
                            </span>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {doc.status === 'DONE' && (
                              <Button variant="ghost" size="sm" asChild>
                                <Link to={`/chat/${doc.id}`} aria-label={`Chat with ${doc.name}`}>
                                  <MessageSquare className="w-4 h-4" />
                                </Link>
                              </Button>
                            )}
                            {doc.status === 'FAILED' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={retryingId === doc.id}
                                onClick={() => void handleRetry(doc)}
                                aria-label={`Retry ${doc.name}`}
                              >
                                {retryingId === doc.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                            {canDownload ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={downloadingId === doc.id}
                                onClick={() => void handleDownload(doc)}
                                aria-label={`Download ${doc.name}`}
                              >
                                {downloadingId === doc.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4" />
                                )}
                              </Button>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button variant="ghost" size="sm" disabled aria-label="File unavailable">
                                      <Download className="w-4 h-4" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>The original file is no longer available</TooltipContent>
                              </Tooltip>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteId(doc.id)}
                              aria-label={`Delete ${doc.name}`}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </motion.div>
          )}

          {hasNextPage && (
            <div className="mt-6 text-center">
              <Button variant="outline" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove this document from your list. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DataPage;
