/**
 * Phase 9 smoke test: collections & cross-document chat.
 *
 * STANDALONE — does not touch scripts/smoke.ts. Runs against a locally
 * running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/smoke.phase9.ts [baseUrl]
 *
 * Covers: collection CRUD, adding documents, cross-document chat whose
 * answer needs facts from BOTH documents (sources must reference both
 * documentIds), IDOR (user B cannot read/chat/modify A's collection; B
 * cannot add A's document to B's collection and vice versa), repeat-question
 * cache hit, membership-change cache invalidation, cleanup.
 * Exits non-zero on any failure.
 */

export {}; // module scope: avoids global-scope collisions with scripts/smoke.ts

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
interface ChatSource {
  chunkIndex: number;
  score: number;
  snippet?: string;
  documentId?: string;
  documentName?: string;
}
interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
  cached?: boolean;
}
interface CollectionResponse {
  id: string;
  name: string;
  documentCount: number;
  documents: Array<{ id: string; name: string; status: string }>;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** Minimal multi-page PDF with plain-text content streams (no deps).
 *  `fact` is a plantable line unique to this PDF. */
function makePdf(pages: number, linesPerPage: number, fact: string): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind phase nine smoke corpus for collections verification.',
    fact,
    'Vector databases store high dimensional embeddings efficiently.',
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

function jsonHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
}

async function uploadPdf(
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
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${filename} failed: ${res.status}`);
  return (await res.json()) as DocumentResponse;
}

async function waitForDone(token: string, docId: string): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(`${BASE}/documents/${docId}`, {
      headers: authHeaders(token),
    });
    const doc = (await res.json()) as DocumentResponse;
    if (doc.status === 'DONE') return;
    if (doc.status === 'FAILED') throw new Error(`ingestion FAILED (${docId})`);
    if (Date.now() - t0 > INGEST_TIMEOUT_MS)
      throw new Error(`ingestion timeout (${docId})`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function collectionChat(
  token: string,
  collectionId: string,
  question: string,
): Promise<{ status: number; body: ChatResponse; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/collections/${collectionId}/chat`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({ question }),
  });
  const body = (await res.json()) as ChatResponse;
  return { status: res.status, body, ms: Date.now() - t0 };
}

async function main(): Promise<void> {
  console.log(`Phase 9 smoke test against ${BASE}\n`);

  // Health + auth
  const health = await fetch(`${BASE}/health`);
  check('GET /health → 200', health.status === 200);
  const a = await registerOrLogin(
    'smoke9-a@documind.dev',
    'Smoke9 A',
    'smoke-test-pass-1',
  );
  const b = await registerOrLogin(
    'smoke9-b@documind.dev',
    'Smoke9 B',
    'smoke-test-pass-2',
  );
  check(
    'register/login users A and B',
    a.accessToken.length > 20 && b.accessToken.length > 20,
  );

  // Two PDFs with distinct plantable facts + one PDF for user B
  const FACT_1 = 'The secret satellite codename is FALCON-3.';
  const FACT_2 = 'The annual research budget is ninety million dollars.';
  const doc1 = await uploadPdf(
    a.accessToken,
    'sat.pdf',
    makePdf(3, 30, FACT_1),
  );
  const doc2 = await uploadPdf(
    a.accessToken,
    'budget.pdf',
    makePdf(3, 30, FACT_2),
  );
  const docB = await uploadPdf(
    b.accessToken,
    'b.pdf',
    makePdf(2, 20, 'User B private fact: the launch site is Kourou.'),
  );
  await waitForDone(a.accessToken, doc1.id);
  await waitForDone(a.accessToken, doc2.id);
  await waitForDone(b.accessToken, docB.id);
  check('all three documents reach DONE', true);

  // Collection CRUD
  const createRes = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ name: 'Phase 9 smoke collection' }),
  });
  check(
    'POST /collections → created',
    createRes.ok,
    `status ${createRes.status}`,
  );
  const collection = (await createRes.json()) as CollectionResponse;

  const badName = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ name: 'x'.repeat(200) }),
  });
  check('name > 120 chars rejected (400)', badName.status === 400);

  // Mass assignment: userId in payload must be stripped (forbidNonWhitelisted → 400)
  const massAssign = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ name: 'evil', userId: b.user.id }),
  });
  check(
    'client-sent userId rejected or ignored',
    massAssign.status === 400 || massAssign.ok,
    `status ${massAssign.status}`,
  );
  if (massAssign.ok) {
    const evil = (await massAssign.json()) as CollectionResponse;
    const asB = await fetch(`${BASE}/collections/${evil.id}`, {
      headers: authHeaders(b.accessToken),
    });
    check('mass-assigned collection did NOT land on user B', !asB.ok);
    await fetch(`${BASE}/collections/${evil.id}`, {
      method: 'DELETE',
      headers: authHeaders(a.accessToken),
    });
  }

  // Add both documents
  for (const d of [doc1, doc2]) {
    const add = await fetch(`${BASE}/collections/${collection.id}/documents`, {
      method: 'POST',
      headers: jsonHeaders(a.accessToken),
      body: JSON.stringify({ documentId: d.id }),
    });
    check(
      `add document ${d.name} to collection`,
      add.ok,
      `status ${add.status}`,
    );
  }
  const listRes = await fetch(`${BASE}/collections`, {
    headers: authHeaders(a.accessToken),
  });
  const list = (await listRes.json()) as CollectionResponse[];
  const mine = list.find((c) => c.id === collection.id);
  check(
    'GET /collections shows document count 2 + names',
    mine?.documentCount === 2 && mine.documents.length === 2,
  );

  // IDOR: B cannot read/chat/modify A's collection
  const idorRead = await fetch(`${BASE}/collections/${collection.id}`, {
    headers: authHeaders(b.accessToken),
  });
  check(
    "IDOR: B cannot read A's collection",
    idorRead.status === 403 || idorRead.status === 404,
    `status ${idorRead.status}`,
  );
  const idorRename = await fetch(`${BASE}/collections/${collection.id}`, {
    method: 'PATCH',
    headers: jsonHeaders(b.accessToken),
    body: JSON.stringify({ name: 'pwned' }),
  });
  check(
    "IDOR: B cannot rename A's collection",
    idorRename.status === 403 || idorRename.status === 404,
  );
  const idorChat = await fetch(`${BASE}/collections/${collection.id}/chat`, {
    method: 'POST',
    headers: jsonHeaders(b.accessToken),
    body: JSON.stringify({ question: 'What is the codename?' }),
  });
  check(
    "IDOR: B cannot chat with A's collection",
    idorChat.status === 403 || idorChat.status === 404,
  );
  const idorAdd = await fetch(
    `${BASE}/collections/${collection.id}/documents`,
    {
      method: 'POST',
      headers: jsonHeaders(b.accessToken),
      body: JSON.stringify({ documentId: docB.id }),
    },
  );
  check(
    "IDOR: B cannot add documents to A's collection",
    idorAdd.status === 403 || idorAdd.status === 404,
  );
  const idorDelete = await fetch(`${BASE}/collections/${collection.id}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  check(
    "IDOR: B cannot delete A's collection",
    idorDelete.status === 403 || idorDelete.status === 404,
  );

  // Cross-ownership document adds
  const bCollectionRes = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: jsonHeaders(b.accessToken),
    body: JSON.stringify({ name: 'B collection' }),
  });
  const bCollection = (await bCollectionRes.json()) as CollectionResponse;
  const bAddsA = await fetch(
    `${BASE}/collections/${bCollection.id}/documents`,
    {
      method: 'POST',
      headers: jsonHeaders(b.accessToken),
      body: JSON.stringify({ documentId: doc1.id }),
    },
  );
  check(
    "IDOR: B cannot add A's document to B's collection",
    bAddsA.status === 403 || bAddsA.status === 404,
    `status ${bAddsA.status}`,
  );
  const aAddsB = await fetch(`${BASE}/collections/${collection.id}/documents`, {
    method: 'POST',
    headers: jsonHeaders(a.accessToken),
    body: JSON.stringify({ documentId: docB.id }),
  });
  check(
    "IDOR: A cannot add B's document to A's collection",
    aAddsB.status === 403 || aAddsB.status === 404,
    `status ${aAddsB.status}`,
  );

  // Cross-document chat: answer needs both docs; sources must span both
  const QUESTION =
    'What is the secret satellite codename and how large is the annual research budget?';
  const chat1 = await collectionChat(a.accessToken, collection.id, QUESTION);
  check(
    'collection chat → 200/201',
    chat1.status === 200 || chat1.status === 201,
  );
  const sources = chat1.body.sources ?? [];
  const sourceDocIds = new Set(sources.map((s) => s.documentId));
  check(
    'sources reference BOTH documentIds',
    sourceDocIds.has(doc1.id) && sourceDocIds.has(doc2.id),
    `docs in sources: ${[...sourceDocIds].join(', ')}`,
  );
  check(
    'sources carry documentName',
    sources.every(
      (s) => typeof s.documentName === 'string' && s.documentName.length > 0,
    ),
  );
  if (!chat1.body.answer.startsWith('This is a stub')) {
    check(
      'answer contains facts from both documents',
      /FALCON-3/i.test(chat1.body.answer) &&
        /ninety million/i.test(chat1.body.answer),
      chat1.body.answer.slice(0, 120),
    );
  }

  // Repeat question → cache hit
  const chat2 = await collectionChat(a.accessToken, collection.id, QUESTION);
  check(
    'repeat question served from cache',
    chat2.body.cached === true,
    `${chat2.ms}ms vs first ${chat1.ms}ms`,
  );

  // Membership change invalidates the cache
  const removeDoc = await fetch(
    `${BASE}/collections/${collection.id}/documents/${doc2.id}`,
    { method: 'DELETE', headers: authHeaders(a.accessToken) },
  );
  check(
    'remove document from collection',
    removeDoc.ok,
    `status ${removeDoc.status}`,
  );
  const chat3 = await collectionChat(a.accessToken, collection.id, QUESTION);
  check(
    'after membership change the same question is NOT a cache hit',
    chat3.body.cached !== true,
  );
  const chat3DocIds = new Set(
    (chat3.body.sources ?? []).map((s) => s.documentId),
  );
  check(
    'post-removal sources no longer reference the removed document',
    !chat3DocIds.has(doc2.id),
  );

  // Cleanup: delete everything, verify gone
  const delCol = await fetch(`${BASE}/collections/${collection.id}`, {
    method: 'DELETE',
    headers: authHeaders(a.accessToken),
  });
  check('DELETE collection → ok', delCol.ok, `status ${delCol.status}`);
  const colGone = await fetch(`${BASE}/collections/${collection.id}`, {
    headers: authHeaders(a.accessToken),
  });
  check('deleted collection → 404', colGone.status === 404);
  await fetch(`${BASE}/collections/${bCollection.id}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  for (const [token, d] of [
    [a.accessToken, doc1],
    [a.accessToken, doc2],
    [b.accessToken, docB],
  ] as Array<[string, DocumentResponse]>) {
    const del = await fetch(`${BASE}/documents/${d.id}`, {
      method: 'DELETE',
      headers: authHeaders(token),
    });
    check(`DELETE document ${d.name} → ok`, del.ok, `status ${del.status}`);
  }
  const docGone = await fetch(`${BASE}/documents/${doc1.id}`, {
    headers: authHeaders(a.accessToken),
  });
  check('deleted document → 404', docGone.status === 404);

  console.log(
    `\n${failures === 0 ? 'PHASE 9 SMOKE PASSED' : `PHASE 9 SMOKE FAILED (${failures} failures)`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
