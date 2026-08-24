import { useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore, type Document } from '@/stores/useAppStore';
import { getApiBaseUrl } from '@/lib/api';

/** Backend document response shape (matches DocumentResponseDto). */
export interface ApiDocument {
  id: string;
  name: string;
  uploadedAt: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  size?: number;
  pageCount?: number;
  chunkCount?: number;
  stage?: string;
  failureReason?: string;
  summary?: string | null;
  suggestedQuestions?: string[] | null;
}

/** Backend paginated list shape (matches DocumentListResponseDto). */
export interface DocumentsPage {
  items: ApiDocument[];
  total: number;
}

export const DOCUMENTS_QUERY_KEY = ['documents'] as const;

/** Server page size (backend caps take at 50, defaults to 24). */
export const DOCUMENTS_PAGE_SIZE = 24;

/** Refetch cadence while any document is still PENDING/PROCESSING. */
const ACTIVE_POLL_MS = 2000;

export function toStoreDocument(d: ApiDocument): Document {
  return {
    id: d.id,
    name: d.name,
    uploadedAt: new Date(d.uploadedAt),
    status: d.status,
    progress: d.progress,
    size: d.size,
    pageCount: d.pageCount,
    chunkCount: d.chunkCount,
    stage: d.stage,
    failureReason: d.failureReason,
    summary: d.summary ?? null,
    suggestedQuestions: d.suggestedQuestions ?? null,
  };
}

async function fetchDocumentsPage(
  token: string,
  baseUrl: string,
  skip: number,
): Promise<DocumentsPage> {
  const res = await fetch(
    `${baseUrl}/documents?take=${DOCUMENTS_PAGE_SIZE}&skip=${skip}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
  return (await res.json()) as DocumentsPage;
}

const isActive = (d: ApiDocument): boolean =>
  d.status === 'PENDING' || d.status === 'PROCESSING';

/**
 * Paginated documents query — the ONE poller for processing status.
 * refetchInterval returns 2000 only while a loaded document is
 * PENDING/PROCESSING, false otherwise. Loaded pages are flattened and
 * synced into the Zustand store so the sidebar and chat keep reading
 * documents from the store as before.
 */
export function useDocumentsQuery() {
  const accessToken = useAppStore((s) => s.accessToken);
  const setDocuments = useAppStore((s) => s.setDocuments);
  const baseUrl = getApiBaseUrl();

  const query = useInfiniteQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: ({ pageParam }) =>
      fetchDocumentsPage(accessToken ?? '', baseUrl ?? '', pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: Boolean(accessToken && baseUrl),
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      q.state.data?.pages.some((p) => p.items.some(isActive))
        ? ACTIVE_POLL_MS
        : false,
  });

  const { data } = query;
  useEffect(() => {
    if (data) {
      setDocuments(data.pages.flatMap((p) => p.items).map(toStoreDocument));
    }
  }, [data, setDocuments]);

  return query;
}

/** Upload/delete/retry flows invalidate the query instead of polling themselves. */
export function useInvalidateDocuments(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
  };
}
