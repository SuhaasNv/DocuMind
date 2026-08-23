import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  summary?: string | null;
  suggestedQuestions?: string[] | null;
}

export const DOCUMENTS_QUERY_KEY = ['documents'] as const;

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
    summary: d.summary ?? null,
    suggestedQuestions: d.suggestedQuestions ?? null,
  };
}

async function fetchDocuments(
  token: string,
  baseUrl: string,
): Promise<ApiDocument[]> {
  const res = await fetch(`${baseUrl}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load documents (${res.status})`);
  return (await res.json()) as ApiDocument[];
}

/**
 * Documents list query — the ONE poller for processing status.
 * refetchInterval returns 2000 only while a document is PENDING/PROCESSING,
 * false otherwise. Query data is synced into the Zustand store so the
 * sidebar and chat keep reading documents from the store as before.
 */
export function useDocumentsQuery() {
  const accessToken = useAppStore((s) => s.accessToken);
  const setDocuments = useAppStore((s) => s.setDocuments);
  const baseUrl = getApiBaseUrl();

  const query = useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: () => fetchDocuments(accessToken ?? '', baseUrl ?? ''),
    enabled: Boolean(accessToken && baseUrl),
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const docs = q.state.data;
      return docs?.some(
        (d) => d.status === 'PENDING' || d.status === 'PROCESSING',
      )
        ? ACTIVE_POLL_MS
        : false;
    },
  });

  const { data } = query;
  useEffect(() => {
    if (data) setDocuments(data.map(toStoreDocument));
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
