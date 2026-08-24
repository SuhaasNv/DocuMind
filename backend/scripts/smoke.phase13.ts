/**
 * Phase 13 smoke test (dashboard revamp): documents list metadata +
 * pagination validation, /me/stats, server-side conversation persistence,
 * IDOR sweep, mass-assignment and XSS round-trip.
 *
 * STANDALONE (helpers copied from smoke.ts). Run against a live backend +
 * Postgres + Redis + worker + LLM provider:
 *   npx ts-node --transpile-only scripts/smoke.phase13.ts [baseUrl]
 *
 * Exits non-zero on any failure.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const INGEST_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_500;
/** Uploads are throttled to 15/min; on 429 we wait out the window once. */
const THROTTLE_WAIT_MS = 61_000;
const STUB_DOC_TOTAL = 25; // past one default page of 24

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}
interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}
interface DocumentResponse {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
  pageCount?: number;
  chunkCount?: number;
  stage?: string;
  failureReason?: string;
  summary?: string;
}
interface DocumentListResponse {
  items: DocumentResponse[];
  total: number;
}
interface ChatSource {
  chunkIndex: number;
  score: number;
  snippet?: string;
}
interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
  conversationId?: string;
}
interface ConversationSummary {
  id: string;
  title: string;
  documentId: string | null;
  documentName?: string;
  lastUserMessage?: string;
  updatedAt: string;
}
interface ConversationList {
  items: ConversationSummary[];
  total: number;
}
interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  truncated: boolean;
}
interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}
interface MeStats {
  documents: number;
  pagesIndexed: number;
  chatsAsked: number;
  insightsPinned: number;
  cacheHitRate: number | null;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal multi-page PDF with plain-text content streams (no deps). */
function makePdf(pages: number, linesPerPage: number): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind phase 13 smoke corpus for dashboard verification.',
    'The quarterly revenue grew by twelve percent year over year.',
    'Vector databases store high dimensional embeddings efficiently.',
    'The secret project codename is AURORA-7 and it launches in June.',
    'Retrieval augmented generation grounds answers in documents.',
    'PostgreSQL with pgvector supports cosine distance search.',
    'Background workers process uploads through a Redis queue.',
  ];
  const objs: string[] = [];
  const pageObjNums: number[] = [];
  let next = 4;
  const contentRefs: Array<{ page: number; content: number }> = [];
  for (let p = 0; p < pages; p++) {
    contentRefs.push({ page: next, content: next + 1 });
    pageObjNums.push(next);
    next += 2;
  }
  objs[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objs[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums
    .map((n) => `${n} 0 R`)
    .join(' ')}] /Count ${pages} >>\nendobj\n`;
  objs[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
  for (let p = 0; p < pages; p++) {
    const { page, content } = contentRefs[p];
    const lines: string[] = [];
    for (let l = 0; l < linesPerPage; l++) {
      lines.push(
        esc(`Page ${p + 1} line ${l + 1}: ${filler[(p + l) % filler.length]}`),
      );
    }
    const stream =
      `BT /F1 10 Tf 40 780 Td 12 TL\n` +
      lines.map((ln) => `(${ln}) Tj T*`).join('\n') +
      `\nET`;
    objs[page] =
      `${page} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>\nendobj\n`;
    objs[content] =
      `${content} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
  }
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < next; i++) {
    offsets[i] = Buffer.byteLength(body);
    body += objs[i];
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${next}\n0000000000 65535 f \n`;
  for (let i = 1; i < next; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer\n<< /Size ${next} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function registerOrLogin(
  email: string,
  name: string,
  password: string,
): Promise<AuthResponse> {
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password }),
  });
  if (reg.ok) return (await reg.json()) as AuthResponse;
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`Auth failed for ${email}: ${login.status}`);
  return (await login.json()) as AuthResponse;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function jsonHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
}

/** Upload with one wait-and-retry when the 15/min upload throttle trips. */
async function uploadPdf(
  token: string,
  filename: string,
  data: Buffer,
): Promise<DocumentResponse> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(data)], { type: 'application/pdf' }),
      filename,
    );
    const res = await fetch(`${BASE}/documents/upload`, {
      method: 'POST',
      headers: authHeaders(token),
      body: form,
    });
    if (res.status === 429 && attempt === 0) {
      console.log(
        `  (upload throttled; waiting ${THROTTLE_WAIT_MS / 1000}s for the window)`,
      );
      await sleep(THROTTLE_WAIT_MS);
      continue;
    }
    if (!res.ok) throw new Error(`upload ${filename} → HTTP ${res.status}`);
    return (await res.json()) as DocumentResponse;
  }
  throw new Error(`upload ${filename} still throttled after retry`);
}

async function waitForDone(
  token: string,
  docId: string,
): Promise<DocumentResponse> {
  const deadline = Date.now() + INGEST_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(`${BASE}/documents/${docId}`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const doc = (await res.json()) as DocumentResponse;
      if (doc.status === 'DONE' || doc.status === 'FAILED') return doc;
    }
    if (Date.now() > deadline)
      throw new Error(`ingestion timeout for ${docId}`);
    await sleep(POLL_INTERVAL_MS);
  }
}

async function getStats(token: string): Promise<MeStats> {
  const res = await fetch(`${BASE}/me/stats`, { headers: authHeaders(token) });
  if (!res.ok) throw new Error(`GET /me/stats → ${res.status}`);
  return (await res.json()) as MeStats;
}

/** Stream one chat turn; returns parsed done payload and streamed text. */
async function streamChatTurn(
  token: string,
  docId: string,
  body: Record<string, unknown>,
): Promise<{ text: string; done: { conversationId?: string } | null }> {
  const res = await fetch(`${BASE}/documents/${docId}/chat/stream`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
  const raw = await res.text();
  let text = '';
  let done: { conversationId?: string } | null = null;
  for (const frame of raw.split('\n\n')) {
    const lines = frame.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data = line.slice(5).trim();
    }
    if (!event || !data) continue;
    if (event === 'delta') {
      try {
        text += JSON.parse(data) as string;
      } catch {
        text += data;
      }
    } else if (event === 'done') {
      done = JSON.parse(data) as { conversationId?: string };
    }
  }
  return { text, done };
}

async function main(): Promise<void> {
  const run = Date.now();
  const a = await registerOrLogin(
    `smoke13a-${run}@example.com`,
    'Smoke13 A',
    'Password123!',
  );
  const b = await registerOrLogin(
    `smoke13b-${run}@example.com`,
    'Smoke13 B',
    'Password123!',
  );
  console.log(`Users: A=${a.user.id} B=${b.user.id}`);

  // ---- Baseline stats -----------------------------------------------------
  const stats0 = await getStats(a.accessToken);
  check(
    '/me/stats baseline shape',
    stats0.documents === 0 &&
      stats0.pagesIndexed === 0 &&
      stats0.chatsAsked === 0 &&
      stats0.insightsPinned === 0 &&
      stats0.cacheHitRate === null,
    JSON.stringify(stats0),
  );

  // ---- Uploads: 1 real chat doc + stubs past one page ---------------------
  const chatDoc: DocumentResponse = await uploadPdf(
    a.accessToken,
    'phase13-chat.pdf',
    makePdf(2, 12),
  );
  const chatDocId: string = chatDoc.id;
  const stubPdf = makePdf(1, 2);
  for (let i = 1; i < STUB_DOC_TOTAL; i++) {
    await uploadPdf(a.accessToken, `phase13-stub-${i}.pdf`, stubPdf);
  }

  const processed = await waitForDone(a.accessToken, chatDocId);
  check(
    'chat doc processed → DONE',
    processed.status === 'DONE',
    processed.status,
  );
  check(
    'doc detail has pageCount',
    processed.pageCount === 2,
    `pageCount ${processed.pageCount}`,
  );
  check(
    'doc detail has chunkCount',
    typeof processed.chunkCount === 'number' && processed.chunkCount >= 1,
    `chunkCount ${processed.chunkCount}`,
  );

  // ---- Paginated documents list ------------------------------------------
  const listRes = await fetch(`${BASE}/documents`, {
    headers: authHeaders(a.accessToken),
  });
  const list = (await listRes.json()) as DocumentListResponse;
  check(
    'GET /documents default page → 24 items',
    list.items.length === 24,
    `${list.items.length}`,
  );
  check(
    'GET /documents total counts all',
    list.total === STUB_DOC_TOTAL,
    `total ${list.total}`,
  );
  const listed =
    list.items.find((d) => d.id === chatDocId) ??
    (
      (await (
        await fetch(`${BASE}/documents?take=50&skip=0`, {
          headers: authHeaders(a.accessToken),
        })
      ).json()) as DocumentListResponse
    ).items.find((d) => d.id === chatDocId);
  check(
    'list row has pageCount/chunkCount',
    listed?.pageCount === 2 && (listed?.chunkCount ?? 0) >= 1,
    JSON.stringify({
      pageCount: listed?.pageCount,
      chunkCount: listed?.chunkCount,
    }),
  );
  check(
    'list row summary is absent-or-string (Phase 8 populates)',
    listed !== undefined &&
      (listed.summary === undefined || typeof listed.summary === 'string'),
    String(listed?.summary),
  );

  const page2Res = await fetch(`${BASE}/documents?take=24&skip=24`, {
    headers: authHeaders(a.accessToken),
  });
  const page2 = (await page2Res.json()) as DocumentListResponse;
  check(
    'pagination past 24 docs',
    page2Res.ok &&
      page2.items.length === STUB_DOC_TOTAL - 24 &&
      page2.total === STUB_DOC_TOTAL,
    `page2 ${page2.items.length}/${page2.total}`,
  );
  const page1Ids = new Set(list.items.map((d) => d.id));
  check(
    'page 2 does not overlap page 1',
    page2.items.every((d) => !page1Ids.has(d.id)),
  );

  for (const [q, label] of [
    ['take=51', 'take above cap 50'],
    ['take=0', 'take zero'],
    ['take=-1', 'negative take'],
    ['take=abc', 'non-numeric take'],
    ['skip=-1', 'negative skip'],
    ['skip=99999999999', 'huge skip'],
    ['skip=xyz', 'non-numeric skip'],
  ] as const) {
    const res = await fetch(`${BASE}/documents?${q}`, {
      headers: authHeaders(a.accessToken),
    });
    check(
      `documents list ${label} → 400`,
      res.status === 400,
      `status ${res.status}`,
    );
  }
  const capRes = await fetch(`${BASE}/documents?take=50`, {
    headers: authHeaders(a.accessToken),
  });
  check(
    'take=50 (cap) accepted',
    capRes.status === 200,
    `status ${capRes.status}`,
  );

  // ---- Chat creates a conversation; messages persist ----------------------
  const xssQuestion =
    '<script>alert("x")</script> What is the secret project codename?';
  const chatRes = await fetch(`${BASE}/documents/${chatDocId}/chat`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ question: xssQuestion }),
  });
  const chat = (await chatRes.json()) as ChatResponse;
  check(
    'chat → 2xx with answer',
    chatRes.ok && chat.answer.length > 0,
    `status ${chatRes.status}`,
  );
  check(
    'chat returns conversationId',
    typeof chat.conversationId === 'string',
    String(chat.conversationId),
  );
  const convId = chat.conversationId as string;

  const detailRes = await fetch(`${BASE}/conversations/${convId}`, {
    headers: authHeaders(a.accessToken),
  });
  const detail = (await detailRes.json()) as ConversationDetail;
  check(
    'GET /conversations/:id hydrates messages',
    detailRes.ok && detail.messages.length === 2,
    `messages ${detail.messages.length}`,
  );
  check(
    'messages persist roles in order',
    detail.messages[0]?.role === 'user' &&
      detail.messages[1]?.role === 'assistant',
  );
  check(
    'assistant message persisted with sources',
    Array.isArray(detail.messages[1]?.sources) &&
      (detail.messages[1]?.sources?.length ?? 0) > 0,
  );
  check(
    'title with <script> round-trips as inert data',
    detailRes.headers.get('content-type')?.includes('application/json') ===
      true && detail.title.startsWith('<script>alert("x")</script>'),
    detail.title,
  );

  // ---- Streamed follow-up appends to the same conversation ----------------
  const followUp = await streamChatTurn(a.accessToken, chatDocId, {
    question: 'Summarize page two in one sentence.',
    conversationId: convId,
  });
  check(
    'stream done event carries conversationId',
    followUp.done?.conversationId === convId,
    String(followUp.done?.conversationId),
  );
  const detail2 = (await (
    await fetch(`${BASE}/conversations/${convId}`, {
      headers: authHeaders(a.accessToken),
    })
  ).json()) as ConversationDetail;
  check(
    'streamed turn persisted (4 messages)',
    detail2.messages.length === 4,
    `messages ${detail2.messages.length}`,
  );

  // ---- Recent conversations ----------------------------------------------
  const recent = (await (
    await fetch(`${BASE}/conversations?take=3`, {
      headers: authHeaders(a.accessToken),
    })
  ).json()) as ConversationList;
  check(
    'recent conversations returns it first',
    recent.items[0]?.id === convId,
    recent.items[0]?.id,
  );
  check(
    'recent row joins document name',
    recent.items[0]?.documentName === 'phase13-chat.pdf',
    String(recent.items[0]?.documentName),
  );
  check(
    'recent row carries last user question',
    recent.items[0]?.lastUserMessage === 'Summarize page two in one sentence.',
    String(recent.items[0]?.lastUserMessage),
  );
  const filtered = (await (
    await fetch(`${BASE}/conversations?documentId=${chatDocId}&take=1`, {
      headers: authHeaders(a.accessToken),
    })
  ).json()) as ConversationList;
  check(
    'documentId filter finds the conversation',
    filtered.items[0]?.id === convId,
  );

  // ---- Stats increment after upload + chat --------------------------------
  const statsB = await getStats(a.accessToken);
  check(
    'stats.documents incremented',
    statsB.documents === STUB_DOC_TOTAL,
    `${statsB.documents}`,
  );
  check(
    'stats.chatsAsked counts user turns',
    statsB.chatsAsked === 2,
    `${statsB.chatsAsked}`,
  );
  check(
    'stats.pagesIndexed >= chat doc pages',
    statsB.pagesIndexed >= 2,
    `${statsB.pagesIndexed}`,
  );

  // ---- Mass assignment: client-sent userId is rejected --------------------
  const massRes = await fetch(`${BASE}/documents/${chatDocId}/chat`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ question: 'hi', userId: b.user.id }),
  });
  check(
    'chat body with userId → 400 (whitelist)',
    massRes.status === 400,
    `status ${massRes.status}`,
  );
  const bList = (await (
    await fetch(`${BASE}/conversations`, {
      headers: authHeaders(b.accessToken),
    })
  ).json()) as ConversationList;
  check(
    "A's conversations never attach to B",
    bList.total === 0,
    `B total ${bList.total}`,
  );

  // ---- IDOR sweep (user B against A's resources) --------------------------
  const idor = (name: string, res: Response) =>
    check(
      `IDOR: ${name} → 403/404`,
      res.status === 403 || res.status === 404,
      `status ${res.status}`,
    );
  idor(
    'GET conversation',
    await fetch(`${BASE}/conversations/${convId}`, {
      headers: authHeaders(b.accessToken),
    }),
  );
  idor(
    'DELETE conversation',
    await fetch(`${BASE}/conversations/${convId}`, {
      method: 'DELETE',
      headers: authHeaders(b.accessToken),
    }),
  );
  idor(
    'GET document',
    await fetch(`${BASE}/documents/${chatDocId}`, {
      headers: authHeaders(b.accessToken),
    }),
  );
  idor(
    'chat on foreign document',
    await fetch(`${BASE}/documents/${chatDocId}/chat`, {
      method: 'POST',
      headers: jsonHeaders(b.accessToken),
      body: JSON.stringify({ question: 'leak?' }),
    }),
  );
  const bDocs = (await (
    await fetch(`${BASE}/documents?take=50`, {
      headers: authHeaders(b.accessToken),
    })
  ).json()) as DocumentListResponse;
  check(
    'paginated list is scoped (B sees no A docs)',
    bDocs.total === 0,
    `B total ${bDocs.total}`,
  );
  const bStats = await getStats(b.accessToken);
  check(
    'stats are scoped (B all zero)',
    bStats.documents === 0 &&
      bStats.chatsAsked === 0 &&
      bStats.pagesIndexed === 0,
  );
  const noAuth = await fetch(`${BASE}/conversations`);
  check(
    'GET /conversations without JWT → 401',
    noAuth.status === 401,
    `status ${noAuth.status}`,
  );
  const noAuthStats = await fetch(`${BASE}/me/stats`);
  check(
    'GET /me/stats without JWT → 401',
    noAuthStats.status === 401,
    `status ${noAuthStats.status}`,
  );

  // ---- Conversation delete cascades messages ------------------------------
  const del = await fetch(`${BASE}/conversations/${convId}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('DELETE own conversation → ok', del.ok, `status ${del.status}`);
  const gone = await fetch(`${BASE}/conversations/${convId}`, {
    headers: authHeaders(a.accessToken),
  });
  check(
    'deleted conversation → 404',
    gone.status === 404,
    `status ${gone.status}`,
  );
  const statsC = await getStats(a.accessToken);
  check(
    'cascade verified: chatsAsked drops to 0 after delete',
    statsC.chatsAsked === 0,
    `${statsC.chatsAsked}`,
  );

  console.log(
    `\n${failures === 0 ? 'SMOKE PASSED' : `SMOKE FAILED (${failures} failures)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});

// Module scope: keeps top-level declarations from colliding with smoke.ts
// when both scripts are type-checked together.
export {};
