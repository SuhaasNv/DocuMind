import { getApiBaseUrlOrThrow } from './api';
import type { CollectionSummary, DocumentStatus } from '@/stores/useAppStore';

/** Backend collection response shape (matches CollectionResponseDto). */
interface ApiCollection {
  id: string;
  name: string;
  createdAt: string;
  documentCount: number;
  documents: { id: string; name: string; status: DocumentStatus }[];
}

function toSummary(c: ApiCollection): CollectionSummary {
  return {
    id: c.id,
    name: c.name,
    createdAt: new Date(c.createdAt),
    documentCount: c.documentCount,
    documents: c.documents,
  };
}

async function request<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiBaseUrlOrThrow()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  // DELETE endpoints return an empty body
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function listCollections(token: string): Promise<CollectionSummary[]> {
  const data = await request<ApiCollection[]>(token, '/collections');
  return data.map(toSummary);
}

export async function fetchCollection(token: string, id: string): Promise<CollectionSummary> {
  return toSummary(await request<ApiCollection>(token, `/collections/${encodeURIComponent(id)}`));
}

export async function createCollection(token: string, name: string): Promise<CollectionSummary> {
  return toSummary(
    await request<ApiCollection>(token, '/collections', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  );
}

export async function deleteCollection(token: string, id: string): Promise<void> {
  await request<undefined>(token, `/collections/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function addDocumentToCollection(
  token: string,
  collectionId: string,
  documentId: string,
): Promise<CollectionSummary> {
  return toSummary(
    await request<ApiCollection>(token, `/collections/${encodeURIComponent(collectionId)}/documents`, {
      method: 'POST',
      body: JSON.stringify({ documentId }),
    }),
  );
}

export async function removeDocumentFromCollection(
  token: string,
  collectionId: string,
  documentId: string,
): Promise<CollectionSummary> {
  return toSummary(
    await request<ApiCollection>(
      token,
      `/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`,
      { method: 'DELETE' },
    ),
  );
}
