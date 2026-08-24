import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertCircle, LayoutGrid, List, RefreshCw } from 'lucide-react';
import Header from '@/components/app/Header';
import UploadArea from '@/components/app/UploadArea';
import DocumentCard from '@/components/app/DocumentCard';
import { EmptyDocuments, EmptySearch } from '@/components/app/EmptyStates';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAppStore, type Document } from '@/stores/useAppStore';
import { usePreferencesStore } from '@/stores/usePreferencesStore';
import { useDocumentsQuery } from '@/hooks/useDocumentsQuery';

type SortKey = 'newest' | 'name' | 'size';
type StatusFilter = 'ALL' | 'DONE' | 'PROCESSING' | 'FAILED';

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'DONE', label: 'Ready' },
  { key: 'PROCESSING', label: 'Processing' },
  { key: 'FAILED', label: 'Failed' },
];

function matchesStatus(doc: Document, filter: StatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'PROCESSING') {
    return doc.status === 'PROCESSING' || doc.status === 'PENDING';
  }
  return doc.status === filter;
}

/** Client-side sort over the loaded page(s). */
function sortDocuments(docs: Document[], sort: SortKey): Document[] {
  const sorted = [...docs];
  if (sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sort === 'size') {
    sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  } else {
    sorted.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  }
  return sorted;
}

const DocumentCardSkeleton = () => (
  <div className="glass-card rounded-xl p-5">
    <div className="flex items-start gap-4">
      <Skeleton className="w-12 h-12 rounded-xl flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const documents = useAppStore((state) => state.documents);
  const documentSearchQuery = useAppStore((state) => state.documentSearchQuery);
  const view = usePreferencesStore((s) => s.documentsView);
  const setView = usePreferencesStore((s) => s.setDocumentsView);
  const [sort, setSort] = useState<SortKey>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // React Query owns fetching/polling; it syncs into the store for sidebar/chat.
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useDocumentsQuery();
  const total = data?.pages[0]?.total ?? documents.length;

  const search = documentSearchQuery.trim().toLowerCase();
  const filteredDocuments = sortDocuments(
    documents.filter(
      (doc) =>
        matchesStatus(doc, statusFilter) &&
        (!search || doc.name.toLowerCase().includes(search)),
    ),
    sort,
  );
  const isFiltered = Boolean(search) || statusFilter !== 'ALL';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Documents" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Upload area */}
          <UploadArea />

          {/* Documents list */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Your Documents</h2>
              <span className="text-sm text-muted-foreground">
                {isFiltered
                  ? `${filteredDocuments.length} of ${total} ${total === 1 ? 'document' : 'documents'}`
                  : `${total} ${total === 1 ? 'document' : 'documents'}`}
              </span>
            </div>

            {/* Controls: sort + view toggle, then status chips in their own scrollable row */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center gap-2">
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="w-[150px] h-9" aria-label="Sort documents">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="size">Size</SelectItem>
                  </SelectContent>
                </Select>
                <div className="ml-auto flex items-center rounded-lg border border-border/50 p-0.5">
                  <Button
                    variant={view === 'grid' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-2.5"
                    onClick={() => setView('grid')}
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                  >
                    <LayoutGrid className="w-4 h-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant={view === 'list' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-8 px-2.5"
                    onClick={() => setView('list')}
                    aria-label="List view"
                    aria-pressed={view === 'list'}
                  >
                    <List className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1">
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
              <div className="space-y-4">
                <DocumentCardSkeleton />
                <DocumentCardSkeleton />
                <DocumentCardSkeleton />
              </div>
            ) : isError && documents.length === 0 ? (
              <div className="glass-card rounded-xl p-8 text-center">
                <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
                <h3 className="font-semibold mb-1">Couldn't load your documents</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  The backend may be unreachable. Check your connection and try again.
                </p>
                <Button variant="outline" onClick={() => void refetch()}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : filteredDocuments.length === 0 ? (
              isFiltered ? (
                <EmptySearch />
              ) : (
                <EmptyDocuments />
              )
            ) : (
              <div
                className={cn(
                  view === 'grid'
                    ? 'grid grid-cols-1 sm:grid-cols-2 gap-4'
                    : 'space-y-4',
                )}
              >
                <AnimatePresence mode="popLayout">
                  {filteredDocuments.map((doc) => (
                    <DocumentCard key={doc.id} document={doc} />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {hasNextPage && (
              <div className="mt-6 text-center">
                <Button
                  variant="outline"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
