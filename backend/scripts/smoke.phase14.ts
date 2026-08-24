/**
 * Phase 14 smoke test (admin console operations): pagination validation,
 * admin search, last-admin/self guards, job + document operation endpoints,
 * real rag-stats shape, audit log, and the non-admin 403 sweep.
 *
 * STANDALONE (helpers copied from smoke.ts). Run against a live backend +
 * Postgres + Redis + worker:
 *   npx ts-node --transpile-only scripts/smoke.phase14.ts [baseUrl]
 *
 * ADMIN CREDENTIALS: admin-only checks need an existing ADMIN account
 * (registration always creates USERs and there is no in-band promotion), so
 * pass it via env:
 *   ADMIN_EMAIL=... ADMIN_PASSWORD=... npx ts-node --transpile-only scripts/smoke.phase14.ts
 * When ADMIN_EMAIL/ADMIN_PASSWORD are absent, every admin-only check is
 * skipped with a [SKIP] note; the non-admin 403 sweep (fresh USER account)
 * always runs. Admin checks are non-destructive except deleting the fresh
 * throwaway USER this script registers.
 *
 * Exits non-zero on any failure.
 */

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
interface UsersList {
  users: Array<{ id: string; email: string; role: string }>;
  total: number;
}
interface AuditList {
  entries: Array<{
    id: string;
    adminEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    createdAt: string;
  }>;
  total: number;
}
interface RagStatsResponse {
  totalChats: number;
  cacheHitRate: number | null;
  avgRetrievalMs: number | null;
  avgFirstTokenMs: number | null;
  avgResponseMs: number | null;
  tokensIn: number;
  tokensOut: number;
  estCostUsd: number | null;
  dailyChatActivity: Array<{ date: string; count: number }>;
  dailyDocumentActivity: Array<{ date: string; count: number }>;
}
interface MetricsResponse {
  totalUsers: number;
  totalCollections: number;
  totalConversations: number;
  totalInsights: number;
  activeShareLinks: number;
}

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function skip(name: string, why: string): void {
  console.log(`[SKIP] ${name} — ${why}`);
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}
function jsonHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders(token) };
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

async function main(): Promise<void> {
  console.log(`Phase 14 smoke against ${BASE}`);
  const stamp = Date.now();
  const user = await registerOrLogin(
    `p14-user-${stamp}@smoke.test`,
    'P14 Smoke User',
    'Sm0ke!pass14',
  );
  check('fresh USER registered', user.user.role === 'USER', user.user.email);

  // ── Non-admin 403 sweep (always runs) ────────────────────────────────────
  const sweep: Array<[string, string]> = [
    ['GET', '/admin/metrics'],
    ['GET', '/admin/health'],
    ['GET', '/admin/users'],
    ['GET', '/admin/users/online'],
    ['GET', '/admin/documents'],
    ['GET', '/admin/jobs'],
    ['GET', '/admin/rag-stats'],
    ['GET', '/admin/audit'],
    ['POST', '/admin/jobs/retry-failed'],
    ['POST', '/admin/jobs/clean'],
    ['POST', '/admin/jobs/1/retry'],
    ['DELETE', '/admin/jobs/1'],
    ['DELETE', '/admin/documents/some-id'],
    ['POST', '/admin/documents/some-id/reprocess'],
    ['DELETE', `/admin/users/${user.user.id}`],
  ];
  for (const [method, path] of sweep) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(user.accessToken),
    });
    check(
      `403 for USER on ${method} ${path}`,
      res.status === 403,
      `got ${res.status}`,
    );
  }
  {
    const res = await fetch(`${BASE}/admin/users/${user.user.id}/role`, {
      method: 'PATCH',
      headers: jsonHeaders(user.accessToken),
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    check(
      '403 for USER on PATCH /admin/users/:id/role',
      res.status === 403,
      `got ${res.status}`,
    );
  }

  // ── Admin-only checks ────────────────────────────────────────────────────
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    skip(
      'all admin-only checks (pagination, search, guards, job/doc ops, rag-stats, audit)',
      'ADMIN_EMAIL/ADMIN_PASSWORD not set',
    );
  } else {
    const login = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!login.ok) {
      check('admin login', false, `status ${login.status}`);
    } else {
      const admin = (await login.json()) as AuthResponse;
      check('admin login has ADMIN role', admin.user.role === 'ADMIN');
      const at = admin.accessToken;
      const get = (path: string) =>
        fetch(`${BASE}${path}`, { headers: authHeaders(at) });

      // Legacy endpoint removed
      const legacy = await get('/admin/stats');
      check(
        'legacy GET /admin/stats removed',
        legacy.status === 404,
        `got ${legacy.status}`,
      );

      // Pagination validation
      check(
        'limit=101 rejected',
        (await get('/admin/users?limit=101')).status === 400,
      );
      check(
        'page=abc rejected',
        (await get('/admin/users?page=abc')).status === 400,
      );
      check(
        'limit=100 accepted',
        (await get('/admin/users?limit=100')).status === 200,
      );
      check(
        'page=0 rejected on documents',
        (await get('/admin/documents?page=0')).status === 400,
      );
      check(
        'bogus status rejected',
        (await get('/admin/documents?status=BOGUS')).status === 400,
      );
      check(
        'jobs pagination garbage rejected',
        (await get('/admin/jobs?limit=nope')).status === 400,
      );

      // Metrics counts extended
      const metricsRes = await get('/admin/metrics');
      const metrics = (await metricsRes.json()) as MetricsResponse;
      check(
        'metrics include collections/conversations/insights/share counts',
        metricsRes.ok &&
          [
            metrics.totalCollections,
            metrics.totalConversations,
            metrics.totalInsights,
            metrics.activeShareLinks,
          ].every((n) => typeof n === 'number'),
      );

      // Server-side search finds the fresh user by email fragment
      const searchRes = await get(
        `/admin/users?search=${encodeURIComponent(`p14-user-${stamp}`)}`,
      );
      const searchBody = (await searchRes.json()) as UsersList;
      check(
        'user search by email fragment',
        searchRes.ok && searchBody.users.some((u) => u.id === user.user.id),
        `total=${searchBody.total}`,
      );

      // Guards: self-deletion and self-demotion refused with 409
      const selfDel = await fetch(`${BASE}/admin/users/${admin.user.id}`, {
        method: 'DELETE',
        headers: authHeaders(at),
      });
      check(
        'self-deletion refused (409)',
        selfDel.status === 409,
        `got ${selfDel.status}`,
      );
      const selfDemote = await fetch(
        `${BASE}/admin/users/${admin.user.id}/role`,
        {
          method: 'PATCH',
          headers: jsonHeaders(at),
          body: JSON.stringify({ role: 'USER' }),
        },
      );
      check(
        'self-demotion refused (409)',
        selfDemote.status === 409,
        `got ${selfDemote.status}`,
      );

      // Job endpoints: garbage id 404s (validation + missing lookup), not 500
      const retryMissing = await fetch(
        `${BASE}/admin/jobs/nonexistent-job-id/retry`,
        {
          method: 'POST',
          headers: authHeaders(at),
        },
      );
      check(
        'retry of missing job 404s',
        retryMissing.status === 404,
        `got ${retryMissing.status}`,
      );
      const removeMissing = await fetch(
        `${BASE}/admin/jobs/nonexistent-job-id`,
        {
          method: 'DELETE',
          headers: authHeaders(at),
        },
      );
      check(
        'remove of missing job 404s',
        removeMissing.status === 404,
        `got ${removeMissing.status}`,
      );
      const longId = 'x'.repeat(200);
      const longIdRes = await fetch(`${BASE}/admin/jobs/${longId}/retry`, {
        method: 'POST',
        headers: authHeaders(at),
      });
      check(
        'oversized job id rejected (400)',
        longIdRes.status === 400,
        `got ${longIdRes.status}`,
      );
      const bulkRetry = await fetch(`${BASE}/admin/jobs/retry-failed`, {
        method: 'POST',
        headers: authHeaders(at),
      });
      check(
        'bulk retry-failed responds',
        bulkRetry.ok,
        `status ${bulkRetry.status}`,
      );
      const clean = await fetch(`${BASE}/admin/jobs/clean`, {
        method: 'POST',
        headers: authHeaders(at),
      });
      check('clean completed responds', clean.ok, `status ${clean.status}`);

      // Document ops: missing ids 404
      const delMissing = await fetch(
        `${BASE}/admin/documents/nonexistent-doc`,
        {
          method: 'DELETE',
          headers: authHeaders(at),
        },
      );
      check(
        'delete of missing document 404s',
        delMissing.status === 404,
        `got ${delMissing.status}`,
      );
      const reprocessMissing = await fetch(
        `${BASE}/admin/documents/nonexistent-doc/reprocess`,
        { method: 'POST', headers: authHeaders(at) },
      );
      check(
        'reprocess of missing document 404s',
        reprocessMissing.status === 404,
        `got ${reprocessMissing.status}`,
      );

      // Real rag-stats shape
      const ragRes = await get('/admin/rag-stats');
      const rag = (await ragRes.json()) as RagStatsResponse;
      check(
        'rag-stats exposes chat telemetry fields',
        ragRes.ok &&
          typeof rag.totalChats === 'number' &&
          Array.isArray(rag.dailyChatActivity) &&
          rag.dailyChatActivity.length === 7 &&
          'cacheHitRate' in rag &&
          'estCostUsd' in rag,
      );

      // Complete deletion of the throwaway user + audit trail
      const delUser = await fetch(`${BASE}/admin/users/${user.user.id}`, {
        method: 'DELETE',
        headers: authHeaders(at),
      });
      check(
        'admin deletes throwaway user',
        delUser.ok,
        `status ${delUser.status}`,
      );
      const auditRes = await get('/admin/audit?page=1&limit=20');
      const audit = (await auditRes.json()) as AuditList;
      check(
        'audit log records user.delete by this admin',
        auditRes.ok &&
          audit.entries.some(
            (e) =>
              e.action === 'user.delete' &&
              e.targetId === user.user.id &&
              e.adminEmail === admin.user.email,
          ),
        `total=${audit.total}`,
      );
    }
  }

  console.log(
    failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`,
  );
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exitCode = 1;
});

// Module scope: keeps top-level declarations from colliding with the other
// smoke scripts when they are type-checked together.
export {};
