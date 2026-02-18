import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { FileText } from 'lucide-react';
import Header from '@/components/app/Header';
import UploadArea from '@/components/app/UploadArea';
import DocumentCard from '@/components/app/DocumentCard';
import { EmptyDocuments, EmptySearch } from '@/components/app/EmptyStates';
import { useAppStore, type Document } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

/** Backend document response shape (matches DocumentResponseDto). */
interface ApiDocument {
  id: string;
  name: string;
  uploadedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  size?: number;
}

const Dashboard = () => {
  const documents = useAppStore((state) => state.documents);
  const documentSearchQuery = useAppStore((state) => state.documentSearchQuery);
  const setDocuments = useAppStore((state) => state.setDocuments);
  const accessToken = useAppStore((state) => state.accessToken);

  const filteredDocuments = documentSearchQuery.trim()
    ? documents.filter((doc) =>
      doc.name.toLowerCase().includes(documentSearchQuery.trim().toLowerCase())
    )
    : documents;

  // Load documents from backend so sidebar and chat use real document IDs.
  useEffect(() => {
    if (!accessToken) return;
    const base = getApiBaseUrl();
    if (!base) return;
    const url = `${base}/documents`;
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load documents'))))
      .then((data: ApiDocument[]) => {
        const docs: Document[] = data.map((d) => ({
          id: d.id,
          name: d.name,
          uploadedAt: new Date(d.uploadedAt),
          status: d.status,
          progress: d.progress,
          size: d.size,
        }));
        setDocuments(docs);
      })
      .catch(() => {
        // Ignore: user may be offline or backend unreachable; documents stay as-is
      });
  }, [accessToken, setDocuments]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <Header title="Documents" />
      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="container mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-8">
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

            {filteredDocuments.length === 0 ? (
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
