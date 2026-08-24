import { useAppStore, ChatSource } from '@/stores/useAppStore';
import { getApiBaseUrlOrThrow } from '@/lib/api';
import { checkSessionExpired } from '@/lib/errorMessages';

export interface Insight {
  id: string;
  question: string;
  content: string;
  sources: ChatSource[];
  documentId: string | null;
  documentName: string | null;
  collectionId: string | null;
  userNote: string | null;
  tags: string[];
  createdAt: string;
}

export interface InsightList {
  insights: Insight[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateInsightInput {
  question: string;
  content: string;
  sources: ChatSource[];
  documentId?: string;
  documentName?: string;
}

export interface InsightFilters {
  query?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

function authHeaders(): Record<string, string> {
  const token = useAppStore.getState().accessToken;
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
}

async function throwOnError(res: Response): Promise<void> {
  if (res.ok) return;
  checkSessionExpired(res);
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) {
      message = Array.isArray(body.message) ? body.message[0] : body.message;
    }
  } catch {
    // Non-JSON error body — keep the status message
  }
  throw new Error(message);
}

export async function createInsight(input: CreateInsightInput): Promise<Insight> {
  const res = await fetch(`${getApiBaseUrlOrThrow()}/insights`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  await throwOnError(res);
  return (await res.json()) as Insight;
}

export async function listInsights(filters: InsightFilters = {}): Promise<InsightList> {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.tag) params.set('tag', filters.tag);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const res = await fetch(`${getApiBaseUrlOrThrow()}/insights${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
  await throwOnError(res);
  return (await res.json()) as InsightList;
}

export async function updateInsight(
  id: string,
  updates: { userNote?: string; tags?: string[] },
): Promise<Insight> {
  const res = await fetch(`${getApiBaseUrlOrThrow()}/insights/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  });
  await throwOnError(res);
  return (await res.json()) as Insight;
}

export async function deleteInsight(id: string): Promise<void> {
  const res = await fetch(`${getApiBaseUrlOrThrow()}/insights/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await throwOnError(res);
}

/** Authenticated markdown export → triggers a browser download via blob URL. */
export async function exportInsights(filters: { query?: string; tag?: string } = {}): Promise<void> {
  const params = new URLSearchParams();
  if (filters.query) params.set('query', filters.query);
  if (filters.tag) params.set('tag', filters.tag);
  const qs = params.toString();
  const res = await fetch(
    `${getApiBaseUrlOrThrow()}/insights/export${qs ? `?${qs}` : ''}`,
    { headers: authHeaders() },
  );
  await throwOnError(res);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'documind-garden.md';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
