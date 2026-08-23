/**
 * Phase 9 integration traps: the two silent-failure risks.
 * 1. Cross-scope isolation: a collection answer must NEVER be served from a
 *    document-scoped cache key, nor a document answer from a collection scope.
 * 2. Membership-change invalidation: removing a member invalidates the
 *    collection scope (fresh answer, no sources from the removed doc).
 * Run: npx ts-node --transpile-only <this file> [baseUrl]
 */
const BASE = process.argv[2] ?? 'http://localhost:3000';

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

interface AuthResponse {
  accessToken: string;
}
interface ChatResponse {
  answer: string;
  cached?: boolean;
  sources?: Array<{ documentId?: string }>;
}

async function auth(): Promise<string> {
  const email = 'smoke-a@documind.dev';
  const password = 'smoke-test-pass-1';
  const login = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) throw new Error(`login ${login.status}`);
  return ((await login.json()) as AuthResponse).accessToken;
}

function pdf(fact: string): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const lines = Array.from({ length: 30 }, (_, i) => `(${esc(`Line ${i + 1}: ${fact}`)}) Tj T*`).join('\n');
  const stream = `BT /F1 10 Tf 40 780 Td 12 TL\n${lines}\nET`;
  const objs = [
    '',
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [4 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
    `4 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(body);
    body += objs[i];
  }
  const xrefStart = Buffer.byteLength(body);
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `${xref}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function upload(token: string, name: string, fact: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(pdf(fact))], { type: 'application/pdf' }), name);
  const res = await fetch(`${BASE}/documents/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`upload ${res.status}`);
  const doc = (await res.json()) as { id: string; status: string };
  const t0 = Date.now();
  let status = doc.status;
  while (status !== 'DONE') {
    if (status === 'FAILED' || Date.now() - t0 > 120000) throw new Error(`ingest ${status}`);
    await new Promise((r) => setTimeout(r, 1500));
    const p = await fetch(`${BASE}/documents/${doc.id}`, { headers: { Authorization: `Bearer ${token}` } });
    status = ((await p.json()) as { status: string }).status;
  }
  return doc.id;
}

async function chat(token: string, path: string, question: string): Promise<ChatResponse> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(`chat ${path} ${res.status}`);
  return (await res.json()) as ChatResponse;
}

async function main(): Promise<void> {
  const token = await auth();
  const docA = await upload(token, 'trap-a.pdf', 'The Alpha budget is 7 million dollars.');
  const docB = await upload(token, 'trap-b.pdf', 'The Beta deadline is 14 October 2026.');

  const colRes = await fetch(`${BASE}/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'cache-trap' }),
  });
  if (!colRes.ok) throw new Error(`collection create ${colRes.status}`);
  const colId = ((await colRes.json()) as { id: string }).id;
  for (const d of [docA, docB]) {
    const add = await fetch(`${BASE}/collections/${colId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ documentId: d }),
    });
    if (!add.ok) throw new Error(`add doc ${add.status}`);
  }

  const q = 'What is the Alpha budget?';

  // Trap 1: cross-scope isolation, both directions.
  const col1 = await chat(token, `/collections/${colId}/chat`, q);
  check('collection first ask is a live answer', col1.cached !== true);
  const doc1 = await chat(token, `/documents/${docA}/chat`, q);
  check('document ask after collection ask is NOT served from collection scope', doc1.cached !== true);
  const col2 = await chat(token, `/collections/${colId}/chat`, q);
  check('collection repeat IS cached in its own scope', col2.cached === true);
  const doc2 = await chat(token, `/documents/${docA}/chat`, q);
  check('document repeat IS cached in its own scope', doc2.cached === true);

  // Trap 2: membership change invalidates the collection scope.
  const rm = await fetch(`${BASE}/collections/${colId}/documents/${docB}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  check('member removal succeeds', rm.ok, `status ${rm.status}`);
  const col3 = await chat(token, `/collections/${colId}/chat`, q);
  check('post-removal collection ask is NOT cached', col3.cached !== true);
  check(
    'post-removal sources contain no removed-document references',
    (col3.sources ?? []).every((s) => s.documentId !== docB),
  );

  // Cleanup.
  await fetch(`${BASE}/collections/${colId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  for (const d of [docA, docB]) {
    await fetch(`${BASE}/documents/${d}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  }

  console.log(failures === 0 ? '\nCACHE TRAPS PASSED' : `\nCACHE TRAPS FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error('[FATAL]', e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
