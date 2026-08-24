import { getApiBaseUrl } from './api';

// ── Types ─────────────────────────────────────────────────────────────────

export type UserRole = 'USER' | 'ADMIN';
export type DocStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  lastActiveAt: string | null;
  createdAt: string;
  _count: { documents: number };
}

export interface AdminDocument {
  id: string;
  name: string;
  status: DocStatus;
  progress: number;
  size?: number;
  uploadedAt: string;
  user: { id: string; name: string; email: string };
}

export interface DocumentsByStatus {
  pending: number;
  processing: number;
  done: number;
  failed: number;
}

export interface JobCounts {
  active: number;
  waiting: number;
  failed: number;
  completed: number;
  delayed: number;
}

export interface JobEntry {
  id: string | undefined;
  name: string;
  data: Record<string, unknown>;
  attemptsMade: number;
  failedReason: string | null;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
}

export interface SystemMetrics {
  totalUsers: number;
  totalDocuments: number;
  totalChunks: number;
  onlineUsers: number;
  documentsByStatus: DocumentsByStatus;
  jobs: JobCounts;
}

export interface JobStats {
  counts: JobCounts;
  jobs: {
    active: JobEntry[];
    waiting: JobEntry[];
    failed: JobEntry[];
    completed: JobEntry[];
    delayed: JobEntry[];
  };
  error?: string;
}

export interface DailyActivity {
  date: string;
  count: number;
}

export interface RagStats {
  totalProcessedDocuments: number;
  totalChunks: number;
  avgChunksPerDocument: number;
  avgRetrievalMs: number | null;
  avgFirstTokenMs: number | null;
  avgResponseMs: number | null;
  dailyDocumentActivity: DailyActivity[];
}

export interface SystemHealth {
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
  queue: 'ok' | 'error';
  llm: 'configured' | 'not_configured';
  timestamp: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch<T>(
  token: string,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...options,
    headers: { ...authHeaders(token), ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────────────────

export async function pingUser(accessToken: string) {
  const res = await fetch(`${getApiBaseUrl()}/auth/ping`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  if (!res.ok) throw new Error('Ping failed');
  return res.json();
}

// ── Metrics & Stats ───────────────────────────────────────────────────────

export async function getAdminMetrics(accessToken: string): Promise<SystemMetrics> {
  return apiFetch<SystemMetrics>(accessToken, '/admin/metrics');
}

// ── System Health ─────────────────────────────────────────────────────────

export async function getSystemHealth(accessToken: string): Promise<SystemHealth> {
  return apiFetch<SystemHealth>(accessToken, '/admin/health');
}

// ── Online Users ──────────────────────────────────────────────────────────

export async function getOnlineUsers(accessToken: string): Promise<AdminUser[]> {
  return apiFetch<AdminUser[]>(accessToken, '/admin/users/online');
}

// ── User Management ───────────────────────────────────────────────────────

export async function getAllUsers(
  accessToken: string,
  page = 1,
  limit = 20,
  search?: string,
): Promise<{ users: AdminUser[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  return apiFetch(accessToken, `/admin/users?${params}`);
}

export async function changeUserRole(
  accessToken: string,
  userId: string,
  role: UserRole,
): Promise<AdminUser> {
  return apiFetch<AdminUser>(accessToken, `/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export async function deleteUser(accessToken: string, userId: string) {
  return apiFetch(accessToken, `/admin/users/${userId}`, { method: 'DELETE' });
}

// ── Document Management ───────────────────────────────────────────────────

export async function getAllDocuments(
  accessToken: string,
  page = 1,
  limit = 20,
  status?: DocStatus,
  search?: string,
): Promise<{ documents: AdminDocument[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  return apiFetch(accessToken, `/admin/documents?${params}`);
}

// ── Job Queue ─────────────────────────────────────────────────────────────

export async function getJobStats(accessToken: string): Promise<JobStats> {
  return apiFetch<JobStats>(accessToken, '/admin/jobs');
}

// ── RAG Analytics ─────────────────────────────────────────────────────────

export async function getRagStats(accessToken: string): Promise<RagStats> {
  return apiFetch<RagStats>(accessToken, '/admin/rag-stats');
}
