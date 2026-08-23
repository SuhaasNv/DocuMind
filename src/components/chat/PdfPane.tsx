import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { getApiBaseUrl } from '@/lib/api';
import { useAppStore } from '@/stores/useAppStore';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfPaneProps {
  documentId: string;
  /** 1-based page to display. */
  page: number;
  /** Normalized excerpt to highlight (best-effort). */
  quote?: string;
  onNumPages: (n: number) => void;
  onLoadError: (message: string) => void;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Inner PDF pane — imported lazily so react-pdf/pdfjs stay out of the chat
 * bundle. Fetches the PDF as a blob with the JWT (pdf.js cannot send
 * Authorization headers itself) and highlights the cited quote in the text
 * layer, best-effort.
 */
export default function PdfPane({
  documentId,
  page,
  quote,
  onNumPages,
  onLoadError,
}: PdfPaneProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const normalizedQuote = useMemo(() => normalize(quote ?? ''), [quote]);

  useEffect(() => {
    let revoked: string | null = null;
    const controller = new AbortController();
    const load = async () => {
      const base = getApiBaseUrl();
      const token = useAppStore.getState().accessToken;
      if (!base || !token) {
        onLoadError('Not signed in');
        return;
      }
      try {
        const res = await fetch(`${base}/documents/${documentId}/file`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!res.ok) {
          onLoadError(
            res.status === 404
              ? 'The original PDF is no longer available for this document.'
              : `Could not load the PDF (${res.status}).`,
          );
          return;
        }
        const blob = await res.blob();
        revoked = URL.createObjectURL(blob);
        setBlobUrl(revoked);
      } catch {
        if (!controller.signal.aborted) onLoadError('Could not load the PDF.');
      }
    };
    void load();
    return () => {
      controller.abort();
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [documentId, onLoadError]);

  // Best-effort highlight: mark text items that appear within the quote.
  const textRenderer = useMemo(() => {
    if (!normalizedQuote || normalizedQuote.length < 8) return undefined;
    return ({ str }: { str: string }) => {
      const escaped = escapeHtml(str);
      const norm = normalize(str);
      if (norm.length >= 4 && normalizedQuote.includes(norm)) {
        return `<mark class="pdf-quote-highlight">${escaped}</mark>`;
      }
      return escaped;
    };
  }, [normalizedQuote]);

  if (!blobUrl) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading PDF" />
      </div>
    );
  }

  const pageWidth = Math.min(680, window.innerWidth - 56);

  return (
    <Document
      file={blobUrl}
      onLoadSuccess={({ numPages }) => onNumPages(numPages)}
      onLoadError={() => onLoadError('Could not render the PDF.')}
      loading={
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading PDF" />
        </div>
      }
    >
      <Page
        pageNumber={page}
        width={pageWidth}
        customTextRenderer={textRenderer}
        renderAnnotationLayer={false}
      />
    </Document>
  );
}
