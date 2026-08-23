import { AnimatePresence } from 'framer-motion';
import { AlertCircle, RefreshCw } from 'lucide-react';
import Header from '@/components/app/Header';
import UploadArea from '@/components/app/UploadArea';
import DocumentCard from '@/components/app/DocumentCard';
import { EmptyDocuments, EmptySearch } from '@/components/app/EmptyStates';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppStore } from '@/stores/useAppStore';
import { useDocumentsQuery } from '@/hooks/useDocumentsQuery';

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

  // React Query owns fetching/polling; it syncs into the store for sidebar/chat.
  const { isLoading, isError, refetch } = useDocumentsQuery();

  const filteredDocuments = documentSearchQuery.trim()
    ? documents.filter((doc) =>
      doc.name.toLowerCase().includes(documentSearchQuery.trim().toLowerCase())
    )
    : documents;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Documents" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Upload area */}
          <UploadArea />

          {/* Documents list */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Your Documents</h2>
              <span className="text-sm text-muted-foreground">
                {filteredDocuments.length} {filteredDocuments.length === 1 ? 'document' : 'documents'}
                {documentSearchQuery.trim() && ` (filtered from ${documents.length})`}
              </span>
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
              documentSearchQuery.trim() ? (
                <EmptySearch />
              ) : (
                <EmptyDocuments />
              )
            ) : (
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {filteredDocuments.map((doc) => (
                    <DocumentCard key={doc.id} document={doc} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
