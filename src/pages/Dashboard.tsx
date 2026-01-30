import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { FileText } from 'lucide-react';
import Header from '@/components/app/Header';
import UploadArea from '@/components/app/UploadArea';
import DocumentCard from '@/components/app/DocumentCard';
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
  const setDocuments = useAppStore((state) => state.setDocuments);
  const accessToken = useAppStore((state) => state.accessToken);

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
    <>
      <Header title="Documents" />
      
      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto max-w-4xl px-6 py-8">
          {/* Upload area */}
          <UploadArea />

          {/* Documents list */}
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Your Documents</h2>
              <span className="text-sm text-muted-foreground">
                {documents.length} {documents.length === 1 ? 'document' : 'documents'}
              </span>
            </div>

            {documents.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-16"
              >
                <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-10 h-10 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No documents yet</h3>
                <p className="text-muted-foreground">
                  Upload a PDF to start chatting with your documents
                </p>
              </motion.div>
            ) : (
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {documents.map((doc) => (
                    <DocumentCard key={doc.id} document={doc} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
};

export default Dashboard;
