# DocuMind Upgrade Roadmap — Phase Summary

Six phases, one commit each. Every phase passed the cumulative
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

## Running the gate

```bash
cd backend
npm run build && npx jest && npx eslint src scripts/smoke.ts
npx ts-node --transpile-only scripts/smoke.ts   # needs running stack
cd .. && npm run build
```
