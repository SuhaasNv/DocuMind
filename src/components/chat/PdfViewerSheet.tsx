import { lazy, Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import type { ChatSource } from '@/stores/useAppStore';

// react-pdf + pdfjs are heavy; load them only when a citation is opened.
const PdfPane = lazy(() => import('./PdfPane'));

interface PdfViewerSheetProps {
  documentId: string;
  documentName: string;
  source: ChatSource | null;
  onClose: () => void;
}

/**
 * Right-side citation viewer (full-screen sheet on mobile): shows the source
 * PDF jumped to the cited page with the quote highlighted, best-effort.
 */
export function PdfViewerSheet({
  documentId,
  documentName,
  source,
  onClose,
}: PdfViewerSheetProps) {
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPageData = source?.pageStart != null;

  useEffect(() => {
    if (source) {
      setPage(source.pageStart ?? 1);
      setError(null);
      setNumPages(null);
    }
  }, [source]);

  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b border-border shrink-0 text-left">
          <SheetTitle className="text-sm font-medium truncate pr-8">
            Source [{source?.marker ?? '–'}] — Page {page}
            {numPages ? ` of ${numPages}` : ''} · {documentName}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {hasPageData
              ? 'Cited passage highlighted where found.'
              : 'No page data for this document yet — showing page 1. Re-upload or retry processing for precise citations.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-auto bg-muted/20 flex justify-center p-3">
          {error ? (
            <p className="text-sm text-muted-foreground mt-12 px-6 text-center">
              {error}
            </p>
          ) : source ? (
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" aria-label="Loading viewer" />
                </div>
              }
            >
              <PdfPane
                documentId={documentId}
                page={page}
                quote={source.quote}
                onNumPages={setNumPages}
                onLoadError={setError}
              />
            </Suspense>
          ) : null}
        </div>

        <div className="flex items-center justify-center gap-3 px-4 py-2.5 border-t border-border shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || !!error}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {page}
            {numPages ? ` / ${numPages}` : ''}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}
            disabled={(numPages !== null && page >= numPages) || !!error}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
