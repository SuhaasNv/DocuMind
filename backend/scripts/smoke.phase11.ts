/**
 * Phase 11 smoke test — shareable answer links (first unauthenticated surface).
 *
 * STANDALONE: does not touch scripts/smoke.ts. Run against a live stack:
 *   npx ts-node --transpile-only scripts/smoke.phase11.ts [baseUrl]
 *
 * Covers: share create/list, public unauthenticated read (headers, whitelist,
 * no leakage), revoke -> 410, expiry -> 410, IDOR (user B), token fuzzing
 * (no 500s, no stack traces), token entropy, per-IP rate limit 429,
 * snapshot survives source-document deletion, cleanup.
 * Exits non-zero on any failure.
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
  sources?: Array<{ chunkIndex: number; score: number; snippet?: string }>;
}
interface ShareCreated {
  token: string;
  url: string;
}
interface ShareListItem {
  id: string;
  token: string;
  createdAt: string;
  revoked: boolean;
  expiresAt: string | null;
  questionExcerpt: string;
}
interface PublicSnapshot {
  question: string;
  answer: string;
  sources: Array<Record<string, unknown>>;
  sharedAt: string;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
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

/** Minimal multi-page PDF with plain-text content streams (no deps). */
function makePdf(pages: number, linesPerPage: number): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind phase eleven smoke corpus for share link verification.',
    'The quarterly revenue grew by twelve percent year over year.',
    'Vector databases store high dimensional embeddings efficiently.',
    'Retrieval augmented generation grounds answers in documents.',
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

async function waitForDone(token: string, docId: string): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(`${BASE}/documents/${docId}`, {
      headers: authHeaders(token),
    });
    if (res.ok) {
      const doc = (await res.json()) as DocumentResponse;
      if (doc.status === 'DONE' || doc.status === 'FAILED') return doc.status;
    }
    if (Date.now() - t0 > INGEST_TIMEOUT_MS) return 'TIMEOUT';
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function createShare(
  token: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${BASE}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify(body),
  });
}

async function getPublic(shareToken: string): Promise<Response> {
  // Unauthenticated by design — no Authorization header.
  return fetch(`${BASE}/share/public/${shareToken}`);
}

async function main(): Promise<void> {
  console.log(`Phase 11 smoke test against ${BASE}\n`);
  const emailA = 'smoke-p11-a@documind.dev';

  // ── Auth ──────────────────────────────────────────────────────────────────
  const a = await registerOrLogin(emailA, 'Smoke P11 A', 'smoke-p11-pass-1');
  const b = await registerOrLogin(
    'smoke-p11-b@documind.dev',
    'Smoke P11 B',
    'smoke-p11-pass-2',
  );
  check(
    'register/login A + B',
    a.accessToken.length > 20 && b.accessToken.length > 20,
  );

  // ── Upload + ingest + chat as A ──────────────────────────────────────────
  const up = await uploadPdf(a.accessToken, 'phase11.pdf', makePdf(3, 8));
  check('A uploads PDF → 201', up.ok, `status ${up.status}`);
  const doc = (await up.json()) as DocumentResponse;
  const status = await waitForDone(a.accessToken, doc.id);
  check('ingestion completes → DONE', status === 'DONE', status);

  const question = 'How much did the quarterly revenue grow?';
  const chatRes = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ question }),
  });
  check('chat returns answer', chatRes.ok, `status ${chatRes.status}`);
  const chat = (await chatRes.json()) as ChatResponse;
  check('chat answer non-empty', chat.answer.length > 0);

  // ── Create share link from the answer (frontend-shaped payload) ──────────
  const sources = (chat.sources ?? []).slice(0, 20).map((s, i) => ({
    marker: i + 1,
    snippet: s.snippet ?? '',
  }));
  const shareRes = await createShare(a.accessToken, {
    question,
    answer: chat.answer,
    sources,
  });
  check('POST /share → created', shareRes.ok, `status ${shareRes.status}`);
  const share = (await shareRes.json()) as ShareCreated;
  check('token is 32+ hex chars', /^[a-f0-9]{32,64}$/.test(share.token));
  check('url is /s/<token>', share.url === `/s/${share.token}`);

  // Mass assignment: hostile extra keys must be rejected (forbidNonWhitelisted)
  const hostile = await createShare(a.accessToken, {
    question,
    answer: chat.answer,
    userId: 'someone-else',
    sources: [
      { marker: 1, snippet: 'x', chunkIndex: 0, score: 1, documentId: doc.id },
    ],
  });
  check('hostile extra keys rejected → 400', hostile.status === 400);

  // Second share (expired) — also used for token-sequence check
  const expiredRes = await createShare(a.accessToken, {
    question,
    answer: chat.answer,
    sources,
    expiresAt: new Date(Date.now() - 3600_000).toISOString(),
  });
  check('second share created', expiredRes.ok);
  const expired = (await expiredRes.json()) as ShareCreated;
  check(
    'tokens are non-sequential (no shared 16-char prefix)',
    share.token.slice(0, 16) !== expired.token.slice(0, 16),
  );

  // ── Public read: no auth, headers, whitelist, no leakage ─────────────────
  const pub = await getPublic(share.token);
  check('public GET with NO auth → 200', pub.status === 200);
  check(
    'X-Robots-Tag: noindex',
    (pub.headers.get('x-robots-tag') ?? '').includes('noindex'),
  );
  check(
    'Cache-Control: no-store',
    (pub.headers.get('cache-control') ?? '').includes('no-store'),
  );
  const rawBody = await pub.text();
  const snap = JSON.parse(rawBody) as PublicSnapshot;
  check('snapshot contains the answer', snap.answer === chat.answer);
  check('snapshot contains the question', snap.question === question);
  check(
    'snapshot has citations',
    Array.isArray(snap.sources) && snap.sources.length > 0,
  );
  const allowedKeys = ['marker', 'pageStart', 'pageEnd', 'quote', 'snippet'];
  check(
    'citations carry ONLY whitelisted keys (page+quote+snippet)',
    Array.isArray(snap.sources) &&
      snap.sources.every((s) =>
        Object.keys(s).every((k) => allowedKeys.includes(k)),
      ),
    JSON.stringify(snap.sources?.[0] ?? {}),
  );
  check('snapshot has no chunkIndex key', !rawBody.includes('chunkIndex'));
  check('snapshot has no score key', !rawBody.includes('"score"'));
  check(
    'snapshot has no documentId',
    !rawBody.includes(doc.id) && !rawBody.includes('documentId'),
  );
  check(
    'snapshot has no file paths',
    !rawBody.includes('uploads') && !rawBody.includes('.pdf'),
  );
  check('snapshot has no user email', !rawBody.includes(emailA));
  check('snapshot has no userId', !rawBody.includes(a.user.id));

  // ── Expired share → 410 ──────────────────────────────────────────────────
  const goneExpired = await getPublic(expired.token);
  check('expired share → 410 Gone', goneExpired.status === 410);
  check(
    '410 body does not echo the token',
    !(await goneExpired.text()).includes(expired.token),
  );

  // ── IDOR: B cannot see or touch A's links ────────────────────────────────
  const mineA = await fetch(`${BASE}/share/mine`, {
    headers: authHeaders(a.accessToken),
  });
  const listA = (await mineA.json()) as ShareListItem[];
  check('A lists own links (>=2)', mineA.ok && listA.length >= 2);
  check(
    'list has question excerpt',
    listA.every((l) => typeof l.questionExcerpt === 'string'),
  );
  const mineB = await fetch(`${BASE}/share/mine`, {
    headers: authHeaders(b.accessToken),
  });
  const listB = (await mineB.json()) as ShareListItem[];
  const aIds = new Set(listA.map((l) => l.id));
  check(
    "B's list does not contain A's links",
    listB.every((l) => !aIds.has(l.id)),
  );
  const shareId = listA.find((l) => l.token === share.token)?.id ?? '';
  const bRevoke = await fetch(`${BASE}/share/${shareId}/revoke`, {
    method: 'POST',
    headers: authHeaders(b.accessToken),
  });
  check("B cannot revoke A's link → 404", bRevoke.status === 404);
  const bDelete = await fetch(`${BASE}/share/${shareId}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  check("B cannot delete A's link → 404", bDelete.status === 404);
  const stillLive = await getPublic(share.token);
  check("A's link still live after B's attempts", stillLive.status === 200);
  await stillLive.text();

  // ── Token param fuzzing: never 500, never stack traces ───────────────────
  const fuzz = [
    '../health',
    '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    encodeURIComponent("' OR '1'='1; --"),
    'a'.repeat(64), // valid format, nonexistent
    '%00',
    '', // empty → route miss
  ];
  for (const t of fuzz) {
    const res = await fetch(`${BASE}/share/public/${t}`);
    const body = await res.text();
    check(
      `fuzz ${JSON.stringify(t.slice(0, 24))} → no 500`,
      res.status < 500,
      `status ${res.status}`,
    );
    check(
      `fuzz ${JSON.stringify(t.slice(0, 24))} → no stack trace`,
      !body.includes('    at ') && !body.toLowerCase().includes('stack'),
    );
  }

  // ── Snapshot frozen: delete source document, share still renders ─────────
  const delDoc = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('A deletes source document', delDoc.ok, `status ${delDoc.status}`);
  const afterDelete = await getPublic(share.token);
  const afterDeleteSnap = afterDelete.ok
    ? ((await afterDelete.json()) as PublicSnapshot)
    : null;
  check(
    'share page survives document deletion (frozen snapshot)',
    afterDelete.status === 200 && afterDeleteSnap?.answer === chat.answer,
    `status ${afterDelete.status}`,
  );

  // ── Revoke → 410 ─────────────────────────────────────────────────────────
  const revoke = await fetch(`${BASE}/share/${shareId}/revoke`, {
    method: 'POST',
    headers: authHeaders(a.accessToken),
  });
  check('A revokes own link', revoke.ok, `status ${revoke.status}`);
  const goneRevoked = await getPublic(share.token);
  check('revoked share → 410 Gone', goneRevoked.status === 410);
  await goneRevoked.text();

  // ── Per-IP rate limit on the public endpoint ─────────────────────────────
  let got429 = false;
  for (let i = 0; i < 60 && !got429; i++) {
    const res = await getPublic(expired.token);
    await res.text();
    if (res.status === 429) got429 = true;
  }
  check('public endpoint rate limit → 429 after hammering', got429);

  // ── Cleanup: revoke + delete everything A created ────────────────────────
  const mineFinal = await fetch(`${BASE}/share/mine`, {
    headers: authHeaders(a.accessToken),
  });
  const finalList = (await mineFinal.json()) as ShareListItem[];
  let cleaned = true;
  for (const l of finalList) {
    const rv = await fetch(`${BASE}/share/${l.id}/revoke`, {
      method: 'POST',
      headers: authHeaders(a.accessToken),
    });
    const dl = await fetch(`${BASE}/share/${l.id}`, {
      method: 'DELETE',
      headers: authHeaders(a.accessToken),
    });
    if (!rv.ok || !dl.ok) cleaned = false;
  }
  const afterCleanup = await fetch(`${BASE}/share/mine`, {
    headers: authHeaders(a.accessToken),
  });
  const emptyList = (await afterCleanup.json()) as ShareListItem[];
  check(
    'cleanup: all links revoked + deleted',
    cleaned && emptyList.length === 0,
  );

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});

// Module scope: keeps top-level names from colliding with scripts/smoke.ts
// when both are type-checked in one program.
export {};
