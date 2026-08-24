# DocuMind Upgrade Roadmap — Phase Summary

Fifteen phases plus a hardening pass, one commit each. Every phase passed the cumulative
verification gate before the next began: backend + frontend builds with
zero TypeScript errors, all unit tests, the cumulative endpoint smoke
suite (`backend/scripts/smoke.ts`), and the security checks (JWT
enforcement, IDOR, upload validation, parameterized SQL, hostile chat
input, no secrets in diffs).

## Phase 1 — Ingestion: batch + parallelize (`perf: batch ingestion pipeline`)

Embeddings batched (64 chunks per OpenAI request), chunks bulk-inserted
in one multi-row parameterized statement per batch, progress writes
throttled to one per batch, worker concurrency 3 with a BullMQ rate
limiter. Fixed `EMBEDDING_DIMENSION` env string-vs-number parsing.
Introduced the smoke suite (self-generating multi-page PDF fixture).

**Measured:** same 10-page PDF (41 chunks, stub embeddings, remote
Postgres): **49,437ms → 7,345ms (~6.7×)**. On private networking the
per-round-trip savings compound further.

## Phase 2 — Token-aware recursive chunking (`feat: token-aware recursive chunking`)

Char sliding window replaced with paragraph → sentence → hard-token-cut
recursive splitting: 400-token chunks, 60-token (~15%) overlap,
cl100k_base (gpt-tokenizer — the one new dependency). Fixes mid-word
tails, whitespace-free text coverage (lossless token cuts), and empty
input now produces zero chunks (processor finishes such documents DONE).
7 unit tests incl. exact-reconstruction and overlap properties.

## Phase 3 — Two-layer Redis chat cache (`feat: two-layer Redis chat cache`)

Exact layer (sha256 of normalized question, scoped per document + topK +
history digest) and semantic layer (query-embedding cosine ≥ 0.95 vs the
document's cached entries). Query embeddings cached; retrieval reuses
them (one embed per miss). Invalidation on delete/reprocess via a
per-document key index. Cached answers replay over the same SSE protocol
with `cached: true` in the done event; hit/miss + latency logged.
Best-effort: Redis failures never break chat.

**Measured:** live stream 4,830ms → cached repeat 1,235ms (mostly proxy
RTT; sub-100ms on private networking).

## Phase 4 — Retrieval quality: tsvector + RRF (`feat: tsvector lexical retrieval fused with RRF`)

Migration restores the HNSW index (dropped by an auto-generated
`schema_sync` migration — dense retrieval had been a sequential scan),
adds a GENERATED tsvector column + GIN index; both verified live via
`pg_indexes`. Lexical leg: leading-wildcard ILIKE → `plainto_tsquery` +
`ts_rank_cd`. Fusion: hand-rolled boosts + min-max normalization →
Reciprocal Rank Fusion (k=60) over a 5× over-fetched dense pool.
Reported scores are now real cosine similarities.

## Phase 5 — Conversation history + contextual retrieval (`feat: conversation history and contextual retrieval`)

Role-separated prompts (system rules + context / history turns / user
question) through a new messages API on LlmService (OpenAI native).
History validated in the DTO, token-capped (`HISTORY_MAX_TOKENS`),
newest-kept; the chat cache is scoped by a history digest. Contextual
retrieval (`CONTEXTUAL_RETRIEVAL=true`, off by default): one situating
sentence per chunk prepended before embedding, bounded concurrency,
failures fall back to the bare chunk. Smoke proves a follow-up
("When does it launch?") resolves its reference via history.

## Phase 6 — Streaming UX + hardening + cleanup (`perf: streaming UX, error surfacing, cleanup`)

Frontend: SSE deltas batched into ~50ms store flushes (was one state
update per token); typewriter reveal catches up adaptively so display is
never slower than the stream; mid-stream errors keep the partial answer.
Backend: mid-stream LLM failures now emit an SSE `error` event (generic
message; details logged) instead of silently truncating; Gemini client
no longer streams raw provider errors. Removed unused
`@nestjs/websockets` / `@nestjs/platform-socket.io`; backend lint is
zero-error across the whole tree; `CODEBASE_DOCUMENTATION.md`
regenerated from the actual code.

## Phase 7 — Inline citations + click-to-view PDF viewer (`feat: inline [n] citations and PDF viewer`)

Chunks became page-aware (page numbers captured at ingestion), answers now
render inline `[n]` citation markers that map to the sources list, and a
new `GET /documents/:id/file` streams the original PDF so clicking a
citation opens react-pdf scrolled to the cited page. The point is
verifiability: a grounded answer is only trustworthy if the reader can
jump straight to the sentence it came from. Ownership is enforced on the
file route like every other document route.

## Phase 8 — Instant activation (`feat: document summaries and suggested questions`)

The moment a document is ready it offers a short generated summary,
suggested-question chips to start a conversation, and follow-up chips after
each answer. This kills the blank-page problem — a fresh document no longer
asks the user to guess what it can answer. Summaries and suggestions are
generated once and stored, so they cost nothing on repeat opens.

## Phase 9 — Collections & cross-document chat (`feat: collections and cross-document chat`)

Documents can be grouped into collections and chatted with as a set:
retrieval fans out across every member document and fuses the results, so a
question can be answered from several PDFs at once. New route
`/collection/:id/chat`. This is the difference between "chat with a file"
and "chat with a body of work" — the natural next step once a user has more
than one relevant document.

## Phase 10 — Knowledge garden (`feat: knowledge garden with markdown export`)

Any answer can be pinned into a personal, searchable library (the
"garden", route `/garden`) and the collection exported as markdown. Good
answers were previously trapped in disposable chat transcripts; the garden
turns them into a durable, portable knowledge base the user actually owns.

## Phase 11 — Shareable public answer links (`feat: shareable public answer snapshots`)

An answer can be published to a public link (`/s/:token`) as a frozen
snapshot — question, answer, and its sources at that moment — with
revoke and expiry controls. Snapshots are frozen on purpose: sharing a
link must not leak the underlying document or drift if the document later
changes. The public route needs no auth; the snapshot carries only what
was shared.

## Phase 12 — Retrieval transparency panel (`feat: per-answer retrieval transparency + telemetry`)

Each answer can expose a debug panel — candidate chunk scores, cache
status (exact/semantic/miss), and stage timings — backed by always-on
chat telemetry. RAG is usually a black box; surfacing why these chunks and
how long each stage took makes the system inspectable for both debugging
and trust, without changing the answer path.

## Phase 13 — Dashboard revamp (`feat: React Query data layer and home hub`)

The frontend data layer moved to `@tanstack/react-query`; document cards
now show the real ingestion stage (EXTRACTING / CHUNKING / EMBEDDING /
FINALIZING) and concrete failure reasons instead of a vague spinner;
conversations persist server-side; and a home hub surfaces `/me/stats` and
a continue-where-you-left-off entry point. The goal was to make progress
and history truthful and resumable — the UI now reflects actual backend
state rather than optimistic guesses.

## Phase 14 — Admin console (`feat: admin console with real analytics and audit log`)

A full operator console: job retry/clean, document delete/reprocess,
user/document search, real analytics (cache-hit-rate, token cost), an
admin audit log, last-admin protection, and complete user deletion
(cascade). This turns the earlier read-only admin view into something you
can actually run the system from, with the audit log and last-admin guard
as the guardrails that keep destructive actions accountable and recoverable
from a lockout.

## Phase 15 — MCP connector (`feat: MCP Streamable HTTP connector`)

DocuMind now speaks MCP: personal API tokens (`dm_...`), a `POST /mcp`
Streamable HTTP endpoint (`@Public()` + `ApiTokenGuard`) built on
`@modelcontextprotocol/sdk`, three read-only tools (`list_documents`,
`search_documents`, `ask_document`), and a terminal-style "Connect to
Claude" landing section with the three setup methods. This lets Claude (or
any MCP client) query a user's documents directly — the app's retrieval
becomes a tool an assistant can call, not just a UI a human clicks.

## Hardening pass — edge cases & trust (`fix: edge-case hardening and error surfacing`)

A pass over the rough edges: an orphan-file sweep for uploads left behind
by failed/deleted documents; specific PDF failure messages
(password-protected / scanned-image / corrupt) instead of one generic
error; upload trust states in the UI; centralized user-facing error
strings with proper 401 session handling; and accessibility labels across
interactive elements. None of it adds features — it makes the existing
ones fail legibly and behave correctly at the margins.

## Running the gate

```bash
cd backend
npm run build && npx jest && npx eslint src scripts/smoke.ts
npx ts-node --transpile-only scripts/smoke.ts   # needs running stack
cd .. && npm run build
```
