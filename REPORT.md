# DocuMind — Overnight Build Report

Generated at the end of the unattended run. Everything below is **committed
locally and gate-green**. Nothing has been pushed or deployed — that one step
waits for your explicit "ship it" (see "Ship line" at the bottom).

## Headline

All fifteen feature phases (7–15, on top of the already-live 1–6) plus an
edge-case hardening pass are **integrated, unit-tested, and verified against a
live local stack**. Full gate: **10/10 end-to-end smoke suites green, 171
backend unit tests, 23 frontend unit tests, both apps build clean, lint clean.**

## What was built this run (each = one gated commit or set)

| Phase | Feature | Verified by |
|---|---|---|
| 7 | Inline `[n]` citations + click-to-view PDF viewer (page-aware chunks, secured file endpoint with Range) | citation battery: markers present, Range 206, IDOR 403 |
| 8 | Instant activation: document summaries + suggested-question chips + follow-up chips (zero added latency) | summaries generated, chips valid, cache-replay parity |
| 9 | Collections & cross-document chat with per-document source attribution | cross-doc sources from both docs + **cache-isolation traps** |
| 10 | Knowledge Garden: pin answers, search, markdown export | pin round-trip, FTS, XSS-safe export, IDOR |
| 11 | Shareable public answer links (frozen snapshots, revoke/expire) | **50-check security battery**: no-auth read, leak-proof, noindex, rate-limit, fuzzing |
| 12 | Retrieval transparency panel + always-on chat telemetry | debug shape present/absent by flag, numeric markers, IDOR |
| 13 | Dashboard revamp: React Query, real progress stages, server-side chat history, home hub | pagination, stats increment, conversation cascade, poller-stops |
| 14 | Admin console: job ops, doc delete/reprocess, search, real analytics, audit log | last-admin guard, complete deletion, audit fan-in, 403 sweep |
| 15 | MCP connector: API tokens + `/mcp` endpoint + "Connect to Claude" landing | live MCP client: handshake, 3 tools, per-user isolation, uniform 401 |
| — | Edge-case hardening & failure-state polish | orphan sweep, PDF failure specificity, upload trust states, centralized errors, a11y |

## Bugs found and fixed in passing (root-caused, regression-tested)

1. **Fake success on scanned PDFs** — a zero-text (image-only) PDF finished as
   DONE with no chunks, looking stuck-but-fine. Now fails with a plain message:
   "This PDF appears to be scanned images with no selectable text…"
2. **Orphaned upload row on write failure** — the DB row was created before the
   file write/enqueue; a failure left a permanent "Pending" ghost card. Now
   rolls back (delete row, unlink) on failure. Plus a 1-hour orphan-file sweep
   backstops any socket-death-at-the-wrong-moment.
3. **Flaky Phase 8 test (~15%)** — root cause was the *test* demanding the model
   always emit follow-up chips (~80% compliance); the feature correctly shows
   nothing when absent. Fixed the test to the real contract; no product change.
4. **Dropped HNSW index** (earlier, Phase 4) — a prior migration had silently
   turned dense search into a sequential scan; restored + GIN added.

## Correctness properties verified (with regression tests)

- **Aborted streams never poison the cache** — the orchestrator stores only on
  clean completion (`!errored && !aborted && answer.length > 0`).
- **Cache fails open** — if Redis is down, every cache method misses/no-ops and
  chat still returns a live answer.
- **Cross-scope cache isolation** — a collection answer is never served from a
  document-scoped key or vice versa; membership changes invalidate.

## Gate results (local)

- `npm run build` (backend + frontend): clean
- `npx jest` (backend): 171 passed / 22 suites
- `npx vitest run` (frontend): 23 passed
- ESLint: clean on all changed files (2 errors remain in vendored shadcn
  `ui/command.tsx` / `ui/textarea.tsx`, present before this work, out of scope)
- Live smoke, fresh backend against Railway Postgres + Redis, OpenAI providers:
  cumulative + phase 8/9/9-traps/10/11/12/13/14/mcp — **all green**

## Autonomous decisions

Logged in `DECISIONS.md` (D1–D9). The load-bearing ones: adapted cherry-pick
integration for every stale-baseline swarm branch (D1/D6); the stray
`origin/main` Phase 12 commit is reconciled at the final push, not before
(D2); the Phase 3 cache cold-starts by design on deploy via the `cc2:` prefix
(D3); and **the final push + deploy are held for your explicit confirmation**
despite the in-prompt blanket authorization, because your standing rule is to
ask before every push and a production deploy is hard-to-reverse (D9).

## Known items / deferred (none blocking)

- Two pre-existing shadcn lint errors (vendored files) — cosmetic, untouched.
- Token cost cards show "—" until `LLM_COST_PER_1K_INPUT/OUTPUT` env rates are
  set (never hardcoded prices).
- LLM token counts are estimated (chars/4) since the providers don't return
  usage; upgrade path commented.
- Live-only checks still worth an eyeball post-deploy: real encrypted/corrupt
  PDF fixtures through the exact pdf-parse version; upload-interrupt timing in a
  real browser; the orphan sweep against Railway's ephemeral disk.
- Two test accounts (`smoke-a@`, `smoke-b@documind.dev`) exist in the DB from
  smoke runs; `smoke-a` was promoted to ADMIN for the admin gate. Say the word
  and I'll remove/demote them.

## Ship line — waiting on you

One command from live. When you say **"ship it"** I will, in order:
1. Push `main` to GitHub (a normal merge reconciles the stray Phase 12 commit).
2. Deploy `documind-api` + `documind-web` to Railway (needs your session — the
   `railway up` permission is denied to me).
3. Apply the new migrations on deploy (they run via `start:prod`).
4. Run the full smoke suite against production with a dedicated throwaway
   account, assert the first post-deploy cache hit carries page-aware sources,
   check prod logs, and clean up every test artifact.
5. Report the deployed commit hash + the MCP connector URL.
