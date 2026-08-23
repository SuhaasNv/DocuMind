/**
 * Phase 12 smoke test — retrieval transparency ("show your work").
 *
 * Standalone; runs against a locally running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/smoke.phase12.ts [baseUrl]
 *
 * Covers: chat with debug:true (non-stream + SSE done event) returns a debug
 * object with retrieval candidates (dense/lexical/rrf scores), included
 * markers, cacheStatus and timings; chat without debug has NO debug key;
 * debug:true grants no cross-user access (403/404); cache-hit repeat with
 * debug:true reports cacheStatus 'exact' or 'semantic'.
 * Exits non-zero on any failure.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const INGEST_TIMEOUT_MS = 120_000;

interface AuthResponse {
  user: { id: string; email: string; name: string; role: string };
  accessToken: string;
}
interface DocumentResponse {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
  progress: number;
}
interface DebugCandidate {
  chunkIndex: number;
  documentId?: string;
  denseScore?: number;
  lexicalScore?: number;
  rrfScore: number;
  retained: boolean;
  included: boolean;
  marker?: string;
}
interface RagDebug {
  cacheStatus: 'miss' | 'exact' | 'semantic';
  semanticSimilarity?: number;
  timings: {
    embedMs: number;
    retrievalMs: number;
    promptBuildMs: number;
    llmFirstTokenMs?: number;
    totalMs: number;
  };
  candidates: DebugCandidate[];
  topK: number;
  historyTurns: number;
}
interface ChatResponse {
  answer: string;
  sources?: Array<{ chunkIndex: number; score: number }>;
  cached?: boolean;
  debug?: RagDebug;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Minimal multi-page PDF with plain-text content streams (no deps). */
function makePdf(pages: number, linesPerPage: number): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind phase twelve smoke corpus for retrieval transparency.',
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

async function uploadPdf(
  token: string,
  filename: string,
  data: Buffer,
): Promise<Response> {
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(data)], { type: 'application/pdf' }),
    filename,
  );
  return fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
}

async function chat(
  token: string,
  docId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: ChatResponse }> {
  const res = await fetch(`${BASE}/documents/${docId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as ChatResponse;
  return { status: res.status, body: json };
}

async function streamChat(
  token: string,
  docId: string,
  question: string,
  debug: boolean,
): Promise<{ deltas: number; text: string; doneEvent: string | null }> {
  const res = await fetch(`${BASE}/documents/${docId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(debug ? { question, debug: true } : { question }),
  });
  if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let deltas = 0;
  let text = '';
  let doneEvent: string | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const eventLine = frame.split('\n').find((l) => l.startsWith('event:'));
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      const event = eventLine?.slice(6).trim() ?? 'message';
      const data = dataLine?.slice(5).trim() ?? '';
      if (event === 'delta') {
        deltas++;
        try {
          const parsed = JSON.parse(data) as string;
          text += typeof parsed === 'string' ? parsed : '';
        } catch {
          text += data;
        }
      } else if (event === 'done') {
        doneEvent = data;
      } else if (event === 'error') {
        throw new Error(`SSE error event: ${data}`);
      }
    }
  }
  return { deltas, text, doneEvent };
}

/** Structural assertions shared by the SSE and non-stream debug payloads. */
function checkDebugShape(label: string, debug: RagDebug | undefined): void {
  check(`${label}: debug object present`, debug != null);
  if (!debug) return;
  check(
    `${label}: cacheStatus valid`,
    ['miss', 'exact', 'semantic'].includes(debug.cacheStatus),
    debug.cacheStatus,
  );
  const t = debug.timings ?? ({} as RagDebug['timings']);
  check(
    `${label}: timings are numbers`,
    [t.embedMs, t.retrievalMs, t.promptBuildMs, t.totalMs].every(
      (n) => typeof n === 'number',
    ),
    JSON.stringify(t),
  );
  check(
    `${label}: topK + historyTurns present`,
    typeof debug.topK === 'number' && typeof debug.historyTurns === 'number',
  );
  const cands = debug.candidates ?? [];
  check(`${label}: candidates non-empty`, cands.length > 0, `${cands.length}`);
  check(
    `${label}: every candidate has rrfScore + flags`,
    cands.every(
      (c) =>
        typeof c.rrfScore === 'number' &&
        typeof c.retained === 'boolean' &&
        typeof c.included === 'boolean',
    ),
  );
  check(
    `${label}: dense scores reported`,
    cands.some((c) => typeof c.denseScore === 'number'),
  );
  check(
    `${label}: included candidates carry [Chunk N] markers`,
    cands.filter((c) => c.included).length > 0 &&
      cands
        .filter((c) => c.included)
        .every((c) => c.marker === `[Chunk ${c.chunkIndex}]`),
  );
  check(
    `${label}: included implies retained`,
    cands.every((c) => !c.included || c.retained),
  );
}

async function main(): Promise<void> {
  console.log(`Phase 12 smoke test against ${BASE}\n`);

  const a = await registerOrLogin(
    'smoke12-a@documind.dev',
    'Smoke12 A',
    'smoke-test-pass-1',
  );
  const b = await registerOrLogin(
    'smoke12-b@documind.dev',
    'Smoke12 B',
    'smoke-test-pass-2',
  );
  check(
    'register/login user A + B',
    a.accessToken.length > 20 && b.accessToken.length > 20,
  );

  const t0 = Date.now();
  const up = await uploadPdf(a.accessToken, 'smoke12.pdf', makePdf(10, 55));
  check('upload PDF accepted', up.ok, `status ${up.status}`);
  if (!up.ok) throw new Error('upload failed, aborting');
  const doc = (await up.json()) as DocumentResponse;
  let status: DocumentResponse['status'] = doc.status;
  while (status !== 'DONE') {
    if (Date.now() - t0 > INGEST_TIMEOUT_MS)
      throw new Error('ingestion timeout (>120s)');
    if (status === 'FAILED') throw new Error('ingestion FAILED');
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${BASE}/documents/${doc.id}`, {
      headers: authHeaders(a.accessToken),
    });
    status = ((await poll.json()) as DocumentResponse).status;
  }
  check('ingestion reaches DONE', true, `${Date.now() - t0}ms`);

  // 1. Non-stream chat WITH debug:true → full debug payload, cache miss.
  const q1 = 'What is the secret project codename in this document?';
  const d1 = await chat(a.accessToken, doc.id, { question: q1, debug: true });
  check('chat with debug → 2xx', d1.status < 300, `status ${d1.status}`);
  checkDebugShape('non-stream debug', d1.body.debug);
  check(
    'first debug chat is a cache miss',
    d1.body.debug?.cacheStatus === 'miss',
    d1.body.debug?.cacheStatus ?? 'absent',
  );

  // 2. Chat WITHOUT debug → NO debug key at all.
  const q2 = 'What do vector databases store?';
  const d2 = await chat(a.accessToken, doc.id, { question: q2 });
  check('chat without debug → 2xx', d2.status < 300, `status ${d2.status}`);
  check(
    'no debug key when flag is off',
    !('debug' in d2.body),
    Object.keys(d2.body).join(','),
  );

  // 3. SSE stream WITH debug → done event carries the debug payload.
  const q3 = 'What does the background worker do with uploads?';
  const s1 = await streamChat(a.accessToken, doc.id, q3, true);
  check('SSE: deltas + done event', s1.deltas > 0 && s1.doneEvent !== null);
  const sseDone = JSON.parse(s1.doneEvent ?? '{}') as {
    sources?: unknown[];
    debug?: RagDebug;
  };
  checkDebugShape('SSE done debug', sseDone.debug);

  // SSE without debug → done event has no debug key.
  const s2 = await streamChat(
    a.accessToken,
    doc.id,
    'How much did quarterly revenue grow?',
    false,
  );
  const sseDonePlain = JSON.parse(s2.doneEvent ?? '{}') as Record<
    string,
    unknown
  >;
  check('SSE without debug: no debug key', !('debug' in sseDonePlain));

  // 4. debug:true grants no cross-user access.
  const idor = await chat(b.accessToken, doc.id, { question: q1, debug: true });
  check(
    'IDOR: user B chat with debug on A document → 403/404',
    idor.status === 403 || idor.status === 404,
    `status ${idor.status}`,
  );

  // 5. Cache-hit repeat with debug:true reports exact/semantic + timings.
  const d3 = await chat(a.accessToken, doc.id, { question: q1, debug: true });
  check('repeat chat with debug → 2xx', d3.status < 300, `status ${d3.status}`);
  check('repeat chat served from cache', d3.body.cached === true);
  check(
    "cache-hit debug reports cacheStatus 'exact' or 'semantic'",
    d3.body.debug?.cacheStatus === 'exact' ||
      d3.body.debug?.cacheStatus === 'semantic',
    d3.body.debug?.cacheStatus ?? 'absent',
  );
  check(
    'cache-hit debug still carries timings',
    typeof d3.body.debug?.timings.totalMs === 'number',
  );

  // Cleanup.
  const del = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('DELETE document → ok', del.ok, `status ${del.status}`);

  console.log(
    `\n${failures === 0 ? 'PHASE 12 SMOKE PASSED' : `PHASE 12 SMOKE FAILED (${failures} failures)`}`,
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
