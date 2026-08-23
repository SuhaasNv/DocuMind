/**
 * Phase 8 smoke test — instant activation (summary + suggested questions)
 * and FOLLOWUPS chips. Standalone; does not touch scripts/smoke.ts.
 *
 * Runs against a locally running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/smoke.phase8.ts [baseUrl]
 *
 * Covers: document responses expose summary/suggestedQuestions (nullable),
 * summary generation after ingestion (skipped under LLM_PROVIDER=stub, which
 * returns non-JSON), chat answers never contain a trailing FOLLOWUPS line,
 * followUps shape on chat + SSE done events, and cache replays keeping chips.
 * Exits non-zero on any failure.
 */

// Module scope (scripts/smoke.ts is a global script; without this the two
// smoke scripts' top-level declarations would collide in `nest build`).
export {};

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
  summary?: string | null;
  suggestedQuestions?: string[] | null;
}
interface ChatResponse {
  answer: string;
  sources?: Array<{ chunkIndex: number; score: number }>;
  followUps?: string[];
  cached?: boolean;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function isNullableStringArray(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.every((q) => typeof q === 'string'))
  );
}

/** Minimal multi-page PDF with plain-text content streams (no deps). */
function makePdf(pages: number, linesPerPage: number): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind Phase 8 smoke corpus for instant activation.',
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
  console.log(`Phase 8 smoke test against ${BASE}\n`);

  // 1. Health + auth
  const health = await fetch(`${BASE}/health`);
  check('GET /health → 200', health.status === 200);
  const a = await registerOrLogin(
    'smoke-p8@documind.dev',
    'Smoke P8',
    'smoke-test-pass-8',
  );
  check('register/login → JWT', a.accessToken.length > 20);

  // 2. Upload + ingest to DONE
  const pdf = makePdf(6, 40);
  const t0 = Date.now();
  const up = await uploadPdf(a.accessToken, 'smoke-p8.pdf', pdf);
  check('upload PDF accepted', up.ok, `status ${up.status}`);
  if (!up.ok) throw new Error('upload failed, aborting');
  const doc = (await up.json()) as DocumentResponse;
  check(
    'upload response exposes nullable summary/suggestedQuestions',
    'summary' in doc && 'suggestedQuestions' in doc,
    JSON.stringify({
      summary: doc.summary ?? null,
      suggestedQuestions: doc.suggestedQuestions ?? null,
    }),
  );

  let detail: DocumentResponse = doc;
  while (detail.status !== 'DONE') {
    if (Date.now() - t0 > INGEST_TIMEOUT_MS)
      throw new Error('ingestion timeout (>120s)');
    if (detail.status === 'FAILED') throw new Error('ingestion FAILED');
    await new Promise((r) => setTimeout(r, 1500));
    const poll = await fetch(`${BASE}/documents/${doc.id}`, {
      headers: authHeaders(a.accessToken),
    });
    detail = (await poll.json()) as DocumentResponse;
  }
  check('ingestion reaches DONE', true, `INGESTION_MS=${Date.now() - t0}`);

  // 3. Summary + suggested questions on the DONE document.
  // Under LLM_PROVIDER=stub the completion is non-JSON, so generation is
  // skipped by design and both fields stay null — the job must still be DONE.
  check(
    'GET /documents/:id carries summary + suggestedQuestions keys',
    'summary' in detail && 'suggestedQuestions' in detail,
  );
  check(
    'summary is string-or-null',
    detail.summary === null ||
      detail.summary === undefined ||
      typeof detail.summary === 'string',
    String(detail.summary).slice(0, 80),
  );
  check(
    'suggestedQuestions is string[]-or-null',
    isNullableStringArray(detail.suggestedQuestions),
  );
  if (typeof detail.summary === 'string') {
    check('summary is non-empty', detail.summary.trim().length > 0);
    check(
      'suggestedQuestions has 1–4 entries',
      Array.isArray(detail.suggestedQuestions) &&
        detail.suggestedQuestions.length >= 1 &&
        detail.suggestedQuestions.length <= 4,
      JSON.stringify(detail.suggestedQuestions),
    );
  } else {
    console.log(
      '[SKIP] summary null (expected under LLM_PROVIDER=stub; lazy backfill retries on GET)',
    );
  }

  // 4. Non-stream chat: FOLLOWUPS line stripped from answer, chips separate
  const chat = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ question: 'What is the secret project codename?' }),
  });
  check('POST chat → 2xx', chat.ok, `status ${chat.status}`);
  const chatBody = (await chat.json()) as ChatResponse;
  check(
    'answer contains no FOLLOWUPS marker line',
    typeof chatBody.answer === 'string' &&
      !/(^|\n)\s*FOLLOWUPS:/.test(chatBody.answer),
    chatBody.answer.slice(-80),
  );
  check(
    'followUps (when present) is a string[] of ≤3',
    chatBody.followUps === undefined ||
      (Array.isArray(chatBody.followUps) &&
        chatBody.followUps.length <= 3 &&
        chatBody.followUps.every((q) => typeof q === 'string')),
    JSON.stringify(chatBody.followUps ?? null),
  );
  if (!chatBody.answer.startsWith('This is a stub')) {
    check(
      'live LLM emits follow-up chips',
      Array.isArray(chatBody.followUps) && chatBody.followUps.length > 0,
    );
  }

  // 5. SSE stream + cached replay keeps chips (stored separately in cache)
  const q = 'What does the background worker do with uploads?';
  const s1 = await streamChat(a.accessToken, doc.id, q);
  check(
    'SSE: deltas arrive and stream terminates',
    s1.deltas > 0 && s1.doneEvent !== null,
    `${s1.deltas} deltas, ${s1.ms}ms`,
  );
  const done1 = JSON.parse(s1.doneEvent ?? '{}') as ChatResponse;
  check(
    'SSE done: followUps (when present) is a string[]',
    isNullableStringArray(done1.followUps),
    JSON.stringify(done1.followUps ?? null),
  );

  const s2 = await streamChat(a.accessToken, doc.id, q);
  const done2 = JSON.parse(s2.doneEvent ?? '{}') as ChatResponse & {
    cached?: boolean;
  };
  check('repeat query served from cache', done2.cached === true, `${s2.ms}ms`);
  check(
    'cached replay text contains no FOLLOWUPS marker',
    !/(^|\n)\s*FOLLOWUPS:/.test(s2.text),
    s2.text.slice(-80),
  );
  check(
    'cached replay carries the same followUps as the live answer',
    JSON.stringify(done2.followUps ?? []) ===
      JSON.stringify(done1.followUps ?? []),
    JSON.stringify(done2.followUps ?? null),
  );

  // 6. Cleanup
  const del = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('DELETE document → ok', del.ok, `status ${del.status}`);

  console.log(
    `\n${failures === 0 ? 'PHASE 8 SMOKE PASSED' : `PHASE 8 SMOKE FAILED (${failures} failures)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
