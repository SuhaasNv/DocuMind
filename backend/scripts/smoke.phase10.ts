/**
 * Phase 10 smoke test — Knowledge Garden (pinned insights).
 *
 * Standalone (does not touch scripts/smoke.ts). Runs against a locally
 * running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/smoke.phase10.ts [baseUrl]
 *
 * Covers: register, upload + ingest PDF, chat, pin the answer, list/search,
 * note+tags patch, markdown export (content + sources appendix), IDOR
 * (user B cannot read/patch/delete/export A's insights), stored-XSS probe
 * (hostile content round-trips as data; export keeps it inert), cleanup.
 * Exits non-zero on any failure.
 */

// Module scope (avoids global-script name collisions with scripts/smoke.ts
// when the whole scripts/ folder is type-checked together).
export {};

const BASE = process.argv[2] ?? 'http://localhost:3000';
const INGEST_TIMEOUT_MS = 120_000;

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
}
interface DocumentResponse {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
}
interface ChatSource {
  marker?: number | null;
  chunkIndex: number;
  score: number;
  snippet?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  quote?: string | null;
  documentId?: string | null;
  documentName?: string | null;
}
interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
}
interface InsightResponse {
  id: string;
  question: string;
  content: string;
  sources: ChatSource[];
  documentId: string | null;
  documentName: string | null;
  userNote: string | null;
  tags: string[];
}
interface InsightListResponse {
  insights: InsightResponse[];
  total: number;
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
    'DocuMind garden smoke corpus for pinned insight verification.',
    'The secret project codename is AURORA-7 and it launches in June.',
    'Retrieval augmented generation grounds answers in documents.',
    'PostgreSQL with pgvector supports cosine distance search.',
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

async function main(): Promise<void> {
  console.log(`Phase 10 smoke test against ${BASE}\n`);

  // 1. Users
  const a = await registerOrLogin(
    'smoke-p10-a@documind.dev',
    'Smoke P10 A',
    'smoke-test-pass-1',
  );
  const b = await registerOrLogin(
    'smoke-p10-b@documind.dev',
    'Smoke P10 B',
    'smoke-test-pass-2',
  );
  check(
    'register/login users A and B',
    a.accessToken.length > 20 && b.accessToken.length > 20,
  );

  // 2. JWT enforcement on insights routes
  const noAuth = await fetch(`${BASE}/insights`);
  check('GET /insights without JWT → 401', noAuth.status === 401);

  // 3. Upload + ingest a PDF
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(makePdf(4, 40))], { type: 'application/pdf' }),
    'garden-smoke.pdf',
  );
  const up = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: authHeaders(a.accessToken),
    body: form,
  });
  check('upload PDF accepted', up.ok, `status ${up.status}`);
  if (!up.ok) throw new Error('upload failed, aborting');
  const doc = (await up.json()) as DocumentResponse;
  const t0 = Date.now();
  let status = doc.status;
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

  // 4. Chat, then pin the answer via the API
  const question = 'What is the secret project codename?';
  const chat = await fetch(`${BASE}/documents/${doc.id}/chat`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ question }),
  });
  check('POST chat → ok', chat.ok, `status ${chat.status}`);
  const chatBody = (await chat.json()) as ChatResponse;
  const pinRes = await fetch(`${BASE}/insights`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({
      question,
      content: chatBody.answer,
      // Full ChatSourceDto shape — the current citation contract.
      sources: (chatBody.sources ?? []).map((s) => ({
        marker: s.marker ?? undefined,
        chunkIndex: s.chunkIndex,
        score: s.score,
        snippet: s.snippet?.slice(0, 1000),
        pageStart: s.pageStart,
        pageEnd: s.pageEnd,
        quote: s.quote?.slice(0, 2000),
        documentId: s.documentId ?? undefined,
        documentName: s.documentName ?? undefined,
      })),
      documentId: doc.id,
      documentName: 'garden-smoke.pdf',
    }),
  });
  check('pin answer → created', pinRes.ok, `status ${pinRes.status}`);
  const pinned = (await pinRes.json()) as InsightResponse;
  check(
    'pinned insight snapshots question/content/sources',
    pinned.question === question &&
      pinned.content === chatBody.answer &&
      Array.isArray(pinned.sources),
  );
  const sentSrc = chatBody.sources?.[0];
  const gotSrc = pinned.sources[0];
  check(
    'pinned source round-trips full shape (marker/pageStart/quote)',
    sentSrc !== undefined &&
      gotSrc !== undefined &&
      gotSrc.marker === (sentSrc.marker ?? null) &&
      gotSrc.pageStart === (sentSrc.pageStart ?? null) &&
      gotSrc.quote === (sentSrc.quote ?? null),
    sentSrc
      ? `marker ${String(sentSrc.marker)}, page ${String(sentSrc.pageStart)}`
      : 'no chat sources',
  );

  // 5. Mass assignment: userId from client must be rejected (whitelist DTO)
  const massAssign = await fetch(`${BASE}/insights`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({
      question: 'q',
      content: 'c',
      sources: [],
      userId: b.user.id,
    }),
  });
  check(
    'pin with userId in body rejected (400)',
    massAssign.status === 400,
    `status ${massAssign.status}`,
  );

  // 6. List + search find the pin
  const list = await fetch(`${BASE}/insights`, {
    headers: authHeaders(a.accessToken),
  });
  const listBody = (await list.json()) as InsightListResponse;
  check(
    'GET /insights lists the pinned insight',
    list.ok && listBody.insights.some((i) => i.id === pinned.id),
    `total ${listBody.total}`,
  );
  const search = await fetch(
    `${BASE}/insights?query=${encodeURIComponent('secret codename')}`,
    { headers: authHeaders(a.accessToken) },
  );
  const searchBody = (await search.json()) as InsightListResponse;
  check(
    'full-text search finds the pinned insight',
    search.ok && searchBody.insights.some((i) => i.id === pinned.id),
  );
  const miss = await fetch(
    `${BASE}/insights?query=${encodeURIComponent('zzqx unrelated flimflam')}`,
    { headers: authHeaders(a.accessToken) },
  );
  const missBody = (await miss.json()) as InsightListResponse;
  check(
    'irrelevant search does not match',
    miss.ok && !missBody.insights.some((i) => i.id === pinned.id),
  );

  // 7. PATCH note + tags (only editable fields)
  const patch = await fetch(`${BASE}/insights/${pinned.id}`, {
    method: 'PATCH',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ userNote: 'Follow up in June.', tags: ['launch'] }),
  });
  const patched = (await patch.json()) as InsightResponse;
  check(
    'PATCH note+tags applied',
    patch.ok &&
      patched.userNote === 'Follow up in June.' &&
      patched.tags.includes('launch'),
  );
  const patchContent = await fetch(`${BASE}/insights/${pinned.id}`, {
    method: 'PATCH',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ content: 'overwritten!' }),
  });
  check(
    'PATCH content rejected (immutable, 400)',
    patchContent.status === 400,
    `status ${patchContent.status}`,
  );
  const tagFilter = await fetch(`${BASE}/insights?tag=launch`, {
    headers: authHeaders(a.accessToken),
  });
  const tagBody = (await tagFilter.json()) as InsightListResponse;
  check(
    'tag filter finds the insight',
    tagFilter.ok && tagBody.insights.some((i) => i.id === pinned.id),
  );

  // 8. Stored-XSS probe: hostile content round-trips as data
  const hostileContent =
    'Try <script>alert(1)</script> and [x](javascript:alert(1)) now';
  const xssPin = await fetch(`${BASE}/insights`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({
      question: '<script>alert("q")</script>',
      content: hostileContent,
      sources: [],
    }),
  });
  check('hostile pin accepted as data', xssPin.ok, `status ${xssPin.status}`);
  const xss = (await xssPin.json()) as InsightResponse;
  check(
    'hostile content round-trips unmodified (stored as data)',
    xss.content === hostileContent &&
      xss.question === '<script>alert("q")</script>',
  );

  // 9. Markdown export: contains pinned content + sources appendix; hostile
  // markup is escaped so it stays inert plain text.
  const exportRes = await fetch(`${BASE}/insights/export`, {
    headers: authHeaders(a.accessToken),
  });
  check(
    'GET /insights/export → ok',
    exportRes.ok,
    `status ${exportRes.status}`,
  );
  check(
    'export content-type is markdown',
    (exportRes.headers.get('content-type') ?? '').includes('text/markdown'),
  );
  check(
    'export filename is the fixed safe name',
    (exportRes.headers.get('content-disposition') ?? '').includes(
      'documind-garden.md',
    ),
  );
  const md = await exportRes.text();
  check(
    'export is a markdown doc',
    md.startsWith('# DocuMind Knowledge Garden'),
  );
  check(
    'export contains the pinned question and note',
    md.includes(question) && md.includes('Follow up in June.'),
  );
  check(
    'export contains a sources appendix',
    md.includes('### Sources') && /- §\d+ \(relevance \d+%\)/.test(md),
  );
  check(
    'export keeps <script> inert (escaped, not raw)',
    !/[^\\]<script>/.test(md) && md.includes('\\<script>'),
  );
  check(
    'export keeps javascript: link inert (escaped, not a live link)',
    !/[^\\]\[x\]\(javascript:/.test(md) &&
      md.includes('\\[x](javascript:alert(1))'),
  );

  // 10. IDOR: user B cannot see, edit, delete, or export A's insights
  const bList = await fetch(`${BASE}/insights`, {
    headers: authHeaders(b.accessToken),
  });
  const bListBody = (await bList.json()) as InsightListResponse;
  check(
    'IDOR: B list does not contain A insights',
    bList.ok &&
      !bListBody.insights.some((i) => i.id === pinned.id || i.id === xss.id),
  );
  const bPatch = await fetch(`${BASE}/insights/${pinned.id}`, {
    method: 'PATCH',
    headers: jsonHeaders(b.accessToken),
    body: JSON.stringify({ userNote: 'hijacked' }),
  });
  check(
    'IDOR: B cannot patch A insight',
    bPatch.status === 403 || bPatch.status === 404,
    `status ${bPatch.status}`,
  );
  const bDel = await fetch(`${BASE}/insights/${pinned.id}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  check(
    'IDOR: B cannot delete A insight',
    bDel.status === 403 || bDel.status === 404,
    `status ${bDel.status}`,
  );
  const bExport = await fetch(`${BASE}/insights/export`, {
    headers: authHeaders(b.accessToken),
  });
  const bMd = await bExport.text();
  check(
    'IDOR: B export does not contain A content',
    bExport.ok &&
      !bMd.includes('AURORA') &&
      !bMd.includes('Follow up in June.'),
  );

  // 11. Document delete → insight survives with documentId nulled (SET NULL)
  const delDoc = await fetch(`${BASE}/documents/${doc.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('delete document → ok', delDoc.ok, `status ${delDoc.status}`);
  const orphanList = await fetch(`${BASE}/insights`, {
    headers: authHeaders(a.accessToken),
  });
  const orphanBody = (await orphanList.json()) as InsightListResponse;
  const orphan = orphanBody.insights.find((i) => i.id === pinned.id);
  check(
    'insight outlives document: documentId nulled, name retained',
    orphan !== undefined &&
      orphan.documentId === null &&
      orphan.documentName === 'garden-smoke.pdf',
  );

  // 12. Cleanup: delete insights, verify gone
  for (const id of [pinned.id, xss.id]) {
    const del = await fetch(`${BASE}/insights/${id}`, {
      method: 'DELETE',
      headers: authHeaders(a.accessToken),
    });
    check(
      `DELETE insight ${id.slice(0, 8)}… → ok`,
      del.ok,
      `status ${del.status}`,
    );
  }
  const afterDelete = await fetch(`${BASE}/insights`, {
    headers: authHeaders(a.accessToken),
  });
  const afterBody = (await afterDelete.json()) as InsightListResponse;
  check(
    'deleted insights are gone',
    !afterBody.insights.some((i) => i.id === pinned.id || i.id === xss.id),
  );

  console.log(
    `\n${failures === 0 ? 'PHASE 10 SMOKE PASSED' : `PHASE 10 SMOKE FAILED (${failures} failures)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
