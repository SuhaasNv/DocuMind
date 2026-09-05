/**
 * Thin fetch wrapper around the real backend HTTP API, shared by the
 * retrieval and answer eval runners. Mirrors the auth/upload/poll pattern
 * already used in scripts/smoke.ts, but scoped to what eval needs.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}
export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}
export interface DocumentResponse {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
}
export interface RetrievalResult {
  chunkId: string;
  content: string;
  score: number;
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  documentId: string;
}
export interface ChatSource {
  marker: number;
  chunkIndex: number;
  score: number;
  snippet: string;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string;
}
export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
  followUps?: string[];
}

const INGEST_TIMEOUT_MS = 120_000;
const INGEST_POLL_MS = 1500;

export class EvalApiClient {
  constructor(private readonly baseUrl: string) {}

  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  /** Register a fresh eval user, or log in if a previous run left one behind. */
  async registerOrLogin(
    email: string,
    name: string,
    password: string,
  ): Promise<AuthResponse> {
    const reg = await fetch(`${this.baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    if (reg.ok) return (await reg.json()) as AuthResponse;
    const login = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!login.ok) {
      throw new Error(`Eval auth failed for ${email}: ${login.status}`);
    }
    return (await login.json()) as AuthResponse;
  }

  async uploadPdf(
    token: string,
    filename: string,
    data: Buffer,
  ): Promise<DocumentResponse> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: 'application/pdf' }),
      filename,
    );
    const res = await fetch(`${this.baseUrl}/documents/upload`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: form,
    });
    if (!res.ok) {
      throw new Error(
        `Eval fixture upload failed for ${filename}: ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as DocumentResponse;
  }

  /** Poll GET /documents/:id until status is DONE (or throw on FAILED/timeout). */
  async waitForDone(token: string, documentId: string): Promise<void> {
    const t0 = Date.now();
    let status: DocumentResponse['status'] = 'PENDING';
    while (status !== 'DONE') {
      if (Date.now() - t0 > INGEST_TIMEOUT_MS) {
        throw new Error(
          `Eval fixture ${documentId} ingestion timeout (>${INGEST_TIMEOUT_MS}ms)`,
        );
      }
      await new Promise((r) => setTimeout(r, INGEST_POLL_MS));
      const res = await fetch(`${this.baseUrl}/documents/${documentId}`, {
        headers: this.authHeaders(token),
      });
      if (!res.ok) {
        throw new Error(
          `Eval fixture ${documentId} status poll failed: ${res.status}`,
        );
      }
      status = ((await res.json()) as DocumentResponse).status;
      if (status === 'FAILED') {
        throw new Error(`Eval fixture ${documentId} ingestion FAILED`);
      }
    }
  }

  async retrieve(
    token: string,
    documentId: string,
    query: string,
    topK: number,
  ): Promise<RetrievalResult[]> {
    const url = `${this.baseUrl}/documents/${documentId}/retrieval?query=${encodeURIComponent(
      query,
    )}&topK=${topK}`;
    const res = await fetch(url, { headers: this.authHeaders(token) });
    if (!res.ok) {
      throw new Error(
        `Eval retrieval call failed: ${res.status} ${await res.text()}`,
      );
    }
    const body = (await res.json()) as { results: RetrievalResult[] };
    return body.results;
  }

  async chat(
    token: string,
    documentId: string,
    question: string,
  ): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/documents/${documentId}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders(token),
      },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) {
      throw new Error(
        `Eval chat call failed: ${res.status} ${await res.text()}`,
      );
    }
    return (await res.json()) as ChatResponse;
  }
}
