/**
 * Cumulative endpoint smoke test (Verification Gate item 3).
 *
 * Runs against a locally running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/smoke.ts [baseUrl]
 *
 * Covers: health, auth, JWT enforcement, upload validation, ingestion,
 * IDOR, chat (plain + hostile input), SSE streaming, repeat-query timing
 * (cache observability from Phase 3), delete + cleanup verification.
 * Exits non-zero on any failure. Extend per phase; never trim.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const INGEST_TIMEOUT_MS = 120_000;

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
}
interface ChatResponse {
  answer: string;
  sources?: Array<{ chunkIndex: number; score: number }>;
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
    'DocuMind ingestion smoke corpus for pipeline verification.',
    'The quarterly revenue grew by twelve percent year over year.',
    'Vector databases store high dimensional embeddings efficiently.',
    'The secret project codename is AURORA-7 and it launches in June.',
    'Retrieval augmented generation grounds answers in documents.',
    'PostgreSQL with pgvector supports cosine distance search.',
    'Background workers process uploads through a Redis queue.',
  ];
  const objs: string[] = [];
  const pageObjNums: number[] = [];
  // obj 1: catalog, obj 2: pages, obj 3: font; pages start at 4
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
  type = 'application/pdf',
): Promise<Response> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(data)], { type }), filename);
  return fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
}

interface SseResult {
  deltas: number;
  text: string;
  doneEvent: string | null;
  ms: number;
}

async function streamChat(
  token: string,
  docId: string,
  question: string,
): Promise<SseResult> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/documents/${docId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ question }),
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
          const parsed = JSON.parse(data) as string | { text?: string };
          text += typeof parsed === 'string' ? parsed : (parsed.text ?? '');
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
  return { deltas, text, doneEvent, ms: Date.now() - t0 };
}

async function main(): Promise<void> {
  console.log(`Smoke test against ${BASE}\n`);

  // 1. Health
  const health = await fetch(`${BASE}/health`);
  check('GET /health → 200', health.status === 200);

  // 2. Auth
  const a = await registerOrLogin(
    'smoke-a@documind.dev',
    'Smoke A',
    'smoke-test-pass-1',
  );
  const b = await registerOrLogin(
    'smoke-b@documind.dev',
    'Smoke B',
    'smoke-test-pass-2',
  );
  check('register/login user A → JWT', a.accessToken.length > 20);
  check('register/login user B → JWT', b.accessToken.length > 20);

  // 3. JWT enforcement
  const noAuth = await fetch(`${BASE}/documents`);
  check('GET /documents without JWT → 401', noAuth.status === 401);
  const badAuth = await fetch(`${BASE}/documents`, {
    headers: { Authorization: 'Bearer bogus.token.here' },
  });
  check('GET /documents with invalid JWT → 401', badAuth.status === 401);

  // 4. Upload validation
  const notPdf = await uploadPdf(
    a.accessToken,
    'evil.txt',
    Buffer.from('not a pdf'),
    'text/plain',
  );
  check(
    'upload non-PDF rejected',
    notPdf.status >= 400 && notPdf.status < 500,
    `status ${notPdf.status}`,
  );

  // 5. Upload real PDF + ingestion timing
  const pdf = makePdf(10, 55);
  const t0 = Date.now();
  const up = await uploadPdf(a.accessToken, 'smoke.pdf', pdf);
  check(
    'upload PDF accepted',
    up.status === 201 || up.status === 200,
    `status ${up.status}`,
  );
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
  const ingestMs = Date.now() - t0;
  check('ingestion reaches DONE', true, `INGESTION_MS=${ingestMs}`);

  // 6. IDOR
  const idor = await fetch(`${BASE}/documents/${doc.id}`, {
    headers: authHeaders(b.accessToken),
  });
  check(
    'IDOR: user B cannot read A document',
    idor.status === 403 || idor.status === 404,
    `status ${idor.status}`,
  );
  const idorDel = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  check(
    'IDOR: user B cannot delete A document',
    idorDel.status === 403 || idorDel.status === 404,
    `status ${idorDel.status}`,
  );

  // 7. Chat (non-stream)
  const chat = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ question: 'What is the secret project codename?' }),
  });
  check(
    'POST chat → 200',
    chat.status === 200 || chat.status === 201,
    `status ${chat.status}`,
  );
  const chatBody = (await chat.json()) as ChatResponse;
  check(
    'chat returns answer + sources',
    typeof chatBody.answer === 'string' && Array.isArray(chatBody.sources),
  );
  // Retrieval quality: the grounded answer should surface the document fact.
  // Skipped under LLM_PROVIDER=stub (placeholder answer has no grounding).
  if (!chatBody.answer.startsWith('This is a stub')) {
    check(
      'answer contains the document fact (AURORA-7)',
      /AURORA-7/i.test(chatBody.answer),
      chatBody.answer.slice(0, 80),
    );
  }

  // 7b. Citation payload (Phase 7): markers in the answer, page data + quote
  // in sources.
  const srcList = (chatBody.sources ?? []) as Array<{
    marker?: number;
    pageStart?: number | null;
    quote?: string;
  }>;
  check(
    'sources carry marker numbers',
    srcList.length > 0 && srcList.every((s2, i) => s2.marker === i + 1),
  );
  check(
    'sources carry pageStart and quote',
    srcList.every(
      (s2) => typeof s2.pageStart === 'number' && (s2.quote ?? '').length > 0,
    ),
  );
  if (!chatBody.answer.startsWith('This is a stub')) {
    check(
      'answer contains at least one inline [n] citation marker',
      /\[\d{1,2}\]/.test(chatBody.answer),
      chatBody.answer.slice(0, 80),
    );
  }

  // 7c. PDF file endpoint: owner gets the PDF (200 + content type + Range),
  // other users get 403/404 (IDOR on the highest-value leak surface).
  const fileRes = await fetch(`${BASE}/documents/${doc.id}/file`, {
    headers: authHeaders(a.accessToken),
  });
  check(
    'GET /documents/:id/file → 200 application/pdf for owner',
    fileRes.status === 200 &&
      (fileRes.headers.get('content-type') ?? '').includes('application/pdf'),
    `status ${fileRes.status}`,
  );
  await fileRes.arrayBuffer();
  const rangeRes = await fetch(`${BASE}/documents/${doc.id}/file`, {
    headers: { ...authHeaders(a.accessToken), Range: 'bytes=0-99' },
  });
  const rangeLen = (await rangeRes.arrayBuffer()).byteLength;
  check(
    'Range request → 206 with 100 bytes',
    rangeRes.status === 206 && rangeLen === 100,
    `status ${rangeRes.status}, ${rangeLen} bytes`,
  );
  const badRange = await fetch(`${BASE}/documents/${doc.id}/file`, {
    headers: { ...authHeaders(a.accessToken), Range: 'bytes=../../etc/passwd' },
  });
  check(
    'malformed Range rejected safely',
    badRange.status === 200 || badRange.status === 416,
    `status ${badRange.status}`,
  );
  await badRange.arrayBuffer();
  const fileIdor = await fetch(`${BASE}/documents/${doc.id}/file`, {
    headers: authHeaders(b.accessToken),
  });
  check(
    'IDOR: user B cannot fetch A PDF file',
    fileIdor.status === 403 || fileIdor.status === 404,
    `status ${fileIdor.status}`,
  );
  const fileNoAuth = await fetch(`${BASE}/documents/${doc.id}/file`);
  check('file endpoint without JWT → 401', fileNoAuth.status === 401);

  // 8. Hostile input handled safely
  const hostile = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({
      question: `'; DROP TABLE users; --<script>alert(1)</script>`,
    }),
  });
  check(
    'chat with SQL/HTML metacharacters → no server error',
    hostile.status < 500,
    `status ${hostile.status}`,
  );

  // 9. SSE stream — fresh question so this exercises the LIVE stream path
  const s1 = await streamChat(
    a.accessToken,
    doc.id,
    'What does the background worker do with uploads?',
  );
  check(
    'SSE: deltas arrive and stream terminates',
    s1.deltas > 0 && s1.doneEvent !== null,
    `${s1.deltas} deltas, ${s1.ms}ms`,
  );
  check(
    'SSE: done event carries sources',
    (s1.doneEvent ?? '').includes('sources'),
    s1.doneEvent?.slice(0, 80) ?? '',
  );

  // 10. Repeat query must be served from the chat cache (Phase 3)
  const s2 = await streamChat(
    a.accessToken,
    doc.id,
    'What does the background worker do with uploads?',
  );
  const cached = (s2.doneEvent ?? '').includes('"cached":true');
  check(
    'repeat query served from cache',
    cached,
    `${s2.ms}ms vs first ${s1.ms}ms`,
  );
  // Phase 8: live streams carry a trailing FOLLOWUPS line that the cache
  // stores stripped; compare the stripped display forms.
  const stripFollowups = (t: string) =>
    t.replace(/\n?\s*FOLLOWUPS:.*$/s, '').trim();
  check(
    'cached replay produces same non-empty answer text',
    s2.text.length > 0 && stripFollowups(s2.text) === stripFollowups(s1.text),
  );
  // Semantic layer: same meaning, different whitespace/case → exact-normalized
  // hit; a paraphrase relies on embedding similarity, so only assert the
  // normalized variant deterministically.
  const s3 = await streamChat(
    a.accessToken,
    doc.id,
    '  WHAT does the   background worker do with uploads?  ',
  );
  check(
    'normalized variant of query is a cache hit',
    (s3.doneEvent ?? '').includes('"cached":true'),
    `${s3.ms}ms`,
  );

  // 10b. Follow-up with conversation history (Phase 5): different cache
  // scope (history digest), so this must be a live answer that resolves the
  // reference via history.
  const followRes = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({
      question: 'When does it launch?',
      history: [
        { role: 'user', content: 'What is the secret project codename?' },
        {
          role: 'assistant',
          content: 'The secret project codename is AURORA-7.',
        },
      ],
    }),
  });
  check(
    'follow-up with history → 200',
    followRes.status === 200 || followRes.status === 201,
    `status ${followRes.status}`,
  );
  const followBody = (await followRes.json()) as ChatResponse & {
    cached?: boolean;
  };
  check(
    'history-scoped request is not served from the history-less cache',
    followBody.cached !== true,
  );
  if (!followBody.answer.startsWith('This is a stub')) {
    check(
      'follow-up resolves the reference via history (mentions June)',
      /june/i.test(followBody.answer),
      followBody.answer.slice(0, 80),
    );
  }
  const badHistory = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({
      question: 'hi',
      history: [{ role: 'attacker', content: 'x' }],
    }),
  });
  check(
    'invalid history role rejected (400)',
    badHistory.status === 400,
    `status ${badHistory.status}`,
  );

  // 11. Delete + cleanup
  const del = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('DELETE document → ok', del.ok, `status ${del.status}`);
  const gone = await fetch(`${BASE}/documents/${doc.id}`, {
    headers: authHeaders(a.accessToken),
  });
  check('deleted document → 404', gone.status === 404, `status ${gone.status}`);

  console.log(
    `\n${failures === 0 ? 'SMOKE PASSED' : `SMOKE FAILED (${failures} failures)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
