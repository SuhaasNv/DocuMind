/**
 * MCP connector smoke test (Phase 15).
 *
 * Runs against a locally running backend + Postgres + Redis:
 *   npx ts-node --transpile-only scripts/mcp-smoke.ts [baseUrl]
 *
 * Covers: REST token endpoints (one-time plaintext, safe display, revoke,
 * IDOR), MCP initialize handshake + tools/list via the official SDK client,
 * happy paths for all three tools, auth probes (missing/malformed/revoked →
 * uniform 401), per-tool cross-user isolation, oversized args, malformed
 * JSON-RPC, and revoked-token tool calls. Exits non-zero on any failure.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const INGEST_TIMEOUT_MS = 120_000;

interface AuthResponse {
  user: { id: string; email: string };
  accessToken: string;
}
interface DocumentResponse {
  id: string;
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';
}
interface CreatedToken {
  id: string;
  name: string;
  token: string;
  last4: string;
}
interface TokenListItem {
  id: string;
  name: string;
  display: string;
  lastUsedAt: string | null;
  revoked: boolean;
}
let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(
    `[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`,
  );
  if (!ok) failures++;
}

// ---- REST helpers (copied from scripts/smoke.ts) ----

/** Minimal one-page PDF with plain-text content streams (no deps). */
function makePdf(pages: number, linesPerPage: number): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const filler = [
    'DocuMind MCP smoke corpus for connector verification.',
    'The quarterly revenue grew by twelve percent year over year.',
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

async function uploadPdf(
  jwt: string,
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
    headers: authHeaders(jwt),
    body: form,
  });
  if (!res.ok) throw new Error(`upload failed: HTTP ${res.status}`);
  return (await res.json()) as DocumentResponse;
}

async function waitForDone(jwt: string, docId: string): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const res = await fetch(`${BASE}/documents/${docId}`, {
      headers: authHeaders(jwt),
    });
    const doc = (await res.json()) as DocumentResponse;
    if (doc.status === 'DONE') return;
    if (doc.status === 'FAILED') throw new Error('ingestion FAILED');
    if (Date.now() - t0 > INGEST_TIMEOUT_MS)
      throw new Error('ingestion timeout');
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// ---- MCP helpers ----

async function connectMcp(apiToken: string): Promise<Client> {
  const client = new Client({ name: 'mcp-smoke', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${apiToken}` } },
  });
  await client.connect(transport);
  return client;
}

function toolText(result: CallToolResult): string {
  const first = result.content[0];
  return first && first.type === 'text' ? String(first.text) : '';
}

/** Raw JSON-RPC POST to /mcp (for auth + malformed-body probes). */
async function rawMcpPost(
  body: string,
  apiToken?: string,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(apiToken ? authHeaders(apiToken) : {}),
    },
    body,
  });
  return { status: res.status, text: await res.text() };
}

const LIST_TOOLS_BODY = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/list',
});

async function main(): Promise<void> {
  console.log(`MCP smoke test against ${BASE}\n`);

  // -- Setup: two users --
  const a = await registerOrLogin(
    'mcp-smoke-a@documind.dev',
    'MCP Smoke A',
    'mcp-smoke-pass-1',
  );
  const b = await registerOrLogin(
    'mcp-smoke-b@documind.dev',
    'MCP Smoke B',
    'mcp-smoke-pass-2',
  );

  // ---- 1. REST token endpoints ----
  const createRes = await fetch(`${BASE}/api-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ name: 'smoke token A' }),
  });
  check('POST /api-tokens → 201', createRes.status === 201);
  const tokenA = (await createRes.json()) as CreatedToken;
  check(
    'create returns plaintext dm_ token once',
    typeof tokenA.token === 'string' &&
      tokenA.token.startsWith('dm_') &&
      tokenA.token.length > 40,
  );
  check('create returns last4', tokenA.last4 === tokenA.token.slice(-4));

  const noJwt = await fetch(`${BASE}/api-tokens`);
  check('GET /api-tokens without JWT → 401', noJwt.status === 401);

  const listRes = await fetch(`${BASE}/api-tokens`, {
    headers: authHeaders(a.accessToken),
  });
  const listBody = (await listRes.json()) as TokenListItem[];
  const listed = listBody.find((t) => t.id === tokenA.id);
  check(
    'list shows only dm_...last4, never plaintext',
    listed !== undefined &&
      listed.display === `dm_...${tokenA.last4}` &&
      !JSON.stringify(listBody).includes(tokenA.token),
  );

  // IDOR: user B cannot revoke or delete A's token.
  const idorRevoke = await fetch(`${BASE}/api-tokens/${tokenA.id}/revoke`, {
    method: 'POST',
    headers: authHeaders(b.accessToken),
  });
  check('IDOR: B revoking A token → 403', idorRevoke.status === 403);
  const idorDelete = await fetch(`${BASE}/api-tokens/${tokenA.id}`, {
    method: 'DELETE',
    headers: authHeaders(b.accessToken),
  });
  check('IDOR: B deleting A token → 403', idorDelete.status === 403);

  // A second token for A that we will revoke later.
  const revokableRes = await fetch(`${BASE}/api-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ name: 'smoke revokable' }),
  });
  const revokable = (await revokableRes.json()) as CreatedToken;
  // And a token for B for cross-user probes.
  const tokenBRes = await fetch(`${BASE}/api-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(b.accessToken),
    },
    body: JSON.stringify({ name: 'smoke token B' }),
  });
  const tokenB = (await tokenBRes.json()) as CreatedToken;

  // Mass assignment: extra fields rejected by the whitelist pipe.
  const massAssign = await fetch(`${BASE}/api-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(a.accessToken),
    },
    body: JSON.stringify({ name: 'evil', userId: b.user.id, revoked: false }),
  });
  check('mass assignment (userId in body) → 400', massAssign.status === 400);

  // ---- 2. Ingest a document for user A ----
  const doc = await uploadPdf(a.accessToken, 'mcp-smoke.pdf', makePdf(2, 12));
  await waitForDone(a.accessToken, doc.id);
  check('document ingested to DONE', true, doc.id);

  // ---- 3. MCP handshake + tools/list ----
  const clientA = await connectMcp(tokenA.token);
  check('MCP initialize handshake succeeds', true);
  const tools = await clientA.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  check(
    'tools/list shows exactly the 3 read+ask tools',
    JSON.stringify(names) ===
      JSON.stringify(['ask_document', 'list_documents', 'search_documents']),
    names.join(','),
  );
  check(
    'every tool has a description and input schema',
    tools.tools.every(
      (t) =>
        (t.description ?? '').length > 20 && t.inputSchema.type === 'object',
    ),
  );

  // ---- 4. Happy paths ----
  const listDocs = await clientA.callTool({
    name: 'list_documents',
    arguments: {},
  });
  const listText = toolText(listDocs as CallToolResult);
  check(
    'list_documents returns the ingested doc',
    listText.includes(doc.id) && listText.includes('DONE'),
  );
  const listParsed = JSON.parse(listText) as Array<{
    id: string;
    summary: string | null;
    pageCount: number | null;
  }>;
  const listedDoc = listParsed.find((d) => d.id === doc.id);
  check(
    'list_documents includes summary and real pageCount',
    listedDoc !== undefined &&
      'summary' in listedDoc &&
      listedDoc.pageCount === 2,
    `pageCount=${String(listedDoc?.pageCount)}`,
  );

  const search = (await clientA.callTool({
    name: 'search_documents',
    arguments: { query: 'secret project codename', topK: 3 },
  })) as CallToolResult;
  check(
    'search_documents (across docs) finds AURORA-7 chunk',
    !search.isError && toolText(search).includes('AURORA-7'),
  );
  const searchParsed = JSON.parse(toolText(search)) as Array<{
    documentId: string;
    documentName: string;
    score: number;
    pageStart: number | null;
    pageEnd: number | null;
  }>;
  check(
    'search results carry pageStart + real cosine scores',
    searchParsed.length > 0 &&
      searchParsed.every(
        (c) =>
          'pageStart' in c &&
          typeof c.score === 'number' &&
          c.score > 0 &&
          c.score <= 1 &&
          typeof c.documentName === 'string',
      ) &&
      searchParsed.some((c) => c.pageStart !== null),
    `first score=${String(searchParsed[0]?.score)}`,
  );

  const searchOne = (await clientA.callTool({
    name: 'search_documents',
    arguments: { query: 'quarterly revenue', documentId: doc.id, topK: 2 },
  })) as CallToolResult;
  check(
    'search_documents (single doc) returns scored chunks',
    !searchOne.isError &&
      toolText(searchOne).includes('score') &&
      toolText(searchOne).includes(doc.id),
  );

  const ask = (await clientA.callTool({
    name: 'ask_document',
    arguments: {
      documentId: doc.id,
      question: 'What is the secret project codename?',
    },
  })) as CallToolResult;
  const askText = toolText(ask);
  check(
    'ask_document answer carries a [n] marker and a Sources block',
    !ask.isError &&
      askText.length > 0 &&
      /\[\d+\]/.test(askText) &&
      askText.includes('Sources:'),
    askText.slice(0, 80).replace(/\n/g, ' '),
  );

  // ---- 5. Auth probes: uniform 401, no oracle ----
  const missing = await rawMcpPost(LIST_TOOLS_BODY);
  const malformed = await rawMcpPost(LIST_TOOLS_BODY, 'not-a-dm-token');
  const unknown = await rawMcpPost(LIST_TOOLS_BODY, 'dm_' + 'A'.repeat(43));
  check('missing token → 401', missing.status === 401);
  check('malformed token → 401', malformed.status === 401);
  check('unknown token → 401', unknown.status === 401);
  check(
    '401 bodies identical (no oracle)',
    missing.text === malformed.text && malformed.text === unknown.text,
    missing.text,
  );

  // ---- 6. Cross-user isolation: token B on every tool ----
  const clientB = await connectMcp(tokenB.token);
  const bList = (await clientB.callTool({
    name: 'list_documents',
    arguments: {},
  })) as CallToolResult;
  check(
    "list_documents: B cannot see A's doc",
    !toolText(bList).includes(doc.id),
  );
  const bSearch = (await clientB.callTool({
    name: 'search_documents',
    arguments: { query: 'secret project codename', documentId: doc.id },
  })) as CallToolResult;
  check(
    "search_documents: A's doc id is 'not found' for B",
    bSearch.isError === true && toolText(bSearch).includes('not found'),
  );
  const bSearchAll = (await clientB.callTool({
    name: 'search_documents',
    arguments: { query: 'secret project codename' },
  })) as CallToolResult;
  check(
    "search_documents (across): no leakage of A's content to B",
    !toolText(bSearchAll).includes('AURORA-7'),
  );
  const bAsk = (await clientB.callTool({
    name: 'ask_document',
    arguments: { documentId: doc.id, question: 'What is the codename?' },
  })) as CallToolResult;
  check(
    "ask_document: A's doc id is 'not found' for B",
    bAsk.isError === true && toolText(bAsk).includes('not found'),
  );
  await clientB.close();

  // ---- 7. Oversized args and malformed JSON-RPC → clean MCP errors ----
  const oversized = (await clientA.callTool({
    name: 'search_documents',
    arguments: { query: 'x'.repeat(2000) },
  })) as CallToolResult;
  check(
    'oversized query → tool error, not 500',
    oversized.isError === true && toolText(oversized).includes('too long'),
  );
  const oversizedAsk = (await clientA.callTool({
    name: 'ask_document',
    arguments: { documentId: doc.id, question: 'x'.repeat(5000) },
  })) as CallToolResult;
  check('oversized question → tool error', oversizedAsk.isError === true);

  const badJson = await rawMcpPost('{"jsonrpc": broken', tokenA.token);
  check(
    'malformed JSON body → 4xx JSON-RPC error (no 500/stack)',
    badJson.status >= 400 &&
      badJson.status < 500 &&
      !badJson.text.includes('at ') &&
      badJson.text.includes('jsonrpc'),
    `HTTP ${badJson.status}`,
  );
  const badRpc = await rawMcpPost(
    JSON.stringify({ id: 9, method: 'tools/list' }), // missing jsonrpc: "2.0"
    tokenA.token,
  );
  check(
    'invalid JSON-RPC envelope → clean error, not 500',
    badRpc.status < 500,
    `HTTP ${badRpc.status}`,
  );

  // ---- 8. Revoked token ----
  const clientRevokable = await connectMcp(revokable.token);
  const preRevoke = (await clientRevokable.callTool({
    name: 'list_documents',
    arguments: {},
  })) as CallToolResult;
  check('token works before revocation', !preRevoke.isError);
  const revokeRes = await fetch(`${BASE}/api-tokens/${revokable.id}/revoke`, {
    method: 'POST',
    headers: authHeaders(a.accessToken),
  });
  check('POST /api-tokens/:id/revoke → 200', revokeRes.status === 200);
  const revokedProbe = await rawMcpPost(LIST_TOOLS_BODY, revokable.token);
  check('revoked token → 401 (same shape)', revokedProbe.status === 401);
  check(
    'revoked 401 body matches other 401s',
    revokedProbe.text === missing.text,
  );
  let revokedToolCallFailed = false;
  try {
    await clientRevokable.callTool({ name: 'list_documents', arguments: {} });
  } catch {
    revokedToolCallFailed = true;
  }
  check(
    'revoked-token tool call via SDK client → auth error',
    revokedToolCallFailed,
  );
  await clientRevokable.close();

  // ---- 9. GET/DELETE /mcp (stateless server) ----
  const getRes = await fetch(`${BASE}/mcp`, {
    headers: authHeaders(tokenA.token),
  });
  check('GET /mcp → 405 (stateless)', getRes.status === 405);

  await clientA.close();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(
    'Smoke test crashed:',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});

export {}; // module scope: avoids global-scope collisions with scripts/smoke.ts
