# DocuMind — Codebase Documentation

> Regenerated 2026-08-24 from the code. The previous version of this file
> described a pre-migration stack (Vercel/Supabase/Upstash, char-based
> chunking, Gemini-only) and should not be referenced.

DocuMind is a per-document RAG chat app: upload a PDF, it is chunked and
embedded in the background, then you chat with it over grounded, streamed
answers with sources.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript, Zustand, Tailwind + shadcn/ui, framer-motion |
| Backend | NestJS 11 (CommonJS build, ESM-style `.js` import specifiers) |
| Database | PostgreSQL 16 + pgvector (HNSW), Prisma 7 with `@prisma/adapter-pg` |
| Queue / cache | Redis — BullMQ 5 (ingestion) + two-layer chat cache |
| LLM | OpenAI (default in prod, chat + embeddings); Gemini / Ollama / stub selectable |
| Deploy | Railway: `documind-web` (nginx static), `documind-api`, `documind-db` (pgvector image), `documind-cache` (Redis) |

## Ingestion pipeline

```
POST /documents/upload (PDF, 50MB, throttled)
  → documents.service: DB row + file at uploads/<id>.pdf + BullMQ job
  → jobs/document.processor (concurrency 3, rate-limited)
      pdf-parse → lib/chunking.ts (token-aware recursive: paragraphs →
      sentences → hard token cuts; 400-token chunks, 60-token overlap,
      cl100k_base via gpt-tokenizer)
      → [optional CONTEXTUAL_RETRIEVAL=true: 1-sentence situating context
         per chunk, prepended before embedding]
      → embedding.service.embedBatch (64 chunks per OpenAI request; stub maps locally)
      → chunks/document-chunk.service.insertChunks (one multi-row
        parameterized INSERT per batch)
      → progress written once per batch; DONE at 100
```

Empty/scan-only PDFs finish DONE with zero chunks. Failures delete partial
chunks and mark FAILED (reason logged). Retry re-enqueues FAILED documents.

## Retrieval & chat

- `documents/retrieval.service.ts` — hybrid retrieval:
  - Dense: pgvector cosine over the HNSW index, over-fetched to topK×5.
  - Lexical: Postgres full-text (`content_tsv` generated column + GIN,
    `plainto_tsquery` + `ts_rank_cd`).
  - Fused with Reciprocal Rank Fusion (k=60). Reported score = real dense
    cosine similarity.
- `rag/prompt.service.ts` — role-separated messages: system (grounding
  rules + `[Chunk N]` context blocks, char-capped), token-capped history
  turns, user question.
- `rag/llm.service.ts` — provider switch (openai/gemini/ollama/stub) with
  `completeMessages`/`streamMessages`; OpenAI gets real role messages.
- `documents/rag-orchestrator.service.ts` — cache check → retrieve →
  prompt → stream. SSE events: `delta`, `error` (generic message; real
  error logged), `done` (sources + `cached` flag).
- `rag/chat-cache.service.ts` — Redis, two layers: exact
  (sha256(normalized question) per document + topK + history digest) and
  semantic (query-embedding cosine ≥ threshold vs cached entries). Query
  embeddings also cached. Invalidated on delete/reprocess. Best-effort:
  Redis errors never break chat.

## Auth & admin

- JWT (Passport), deny-by-default via global guard + `@Public()` opt-outs.
- `POST /auth/register|login` (throttled 10/min), `/auth/ping`
  (lastActiveAt), `/auth/change-password` (bcrypt-verified).
- `/admin/*` behind `@Roles(ADMIN)`: users, documents, jobs, metrics.

## Frontend structure

- `src/lib/chatStream.ts` — module-level stream controller: chats keep
  streaming across navigation; ~50ms batched store flushes; idle-based
  timeout; partial answers preserved on mid-stream errors;
  `stopAllChatStreams()` on logout.
- `src/lib/sseChat.ts` — fetch-based SSE parser (delta/done/error).
- `src/stores/useAppStore.ts` — auth (persisted), documents,
  conversations, notifications. `src/stores/usePreferencesStore.ts` —
  auto-scroll, sources, animations, typewriter toggles (all wired).
- Routes: marketing pages under `PublicLayout`; `/app` (Documents),
  `/app/settings`, `/app/admin`, `/chat/:documentId` behind auth.

## Environment variables (backend)

Required: `DATABASE_URL` (or Railway aliases), `JWT_SECRET`.
Redis: `REDIS_URL` (path selects logical DB, e.g. `/1`) or
`REDIS_HOST`/`PORT`/`PASSWORD`.
LLM: `LLM_PROVIDER` (stub default) + provider keys (`OPENAI_API_KEY`,
`OPENAI_CHAT_MODEL`, `GEMINI_API_KEY`, `OLLAMA_*`).
Embeddings: `EMBEDDING_PROVIDER` (stub default), `EMBEDDING_DIMENSION`
(1536), `OPENAI_EMBEDDING_MODEL`.
RAG: `MAX_CHUNK_CHARS`, `MAX_CONTEXT_CHARS`, `HISTORY_MAX_TOKENS`,
`CONTEXTUAL_RETRIEVAL`, `CHAT_CACHE_TTL_SECONDS`,
`CHAT_CACHE_SEMANTIC_THRESHOLD`.
See `backend/.env.example` for the full annotated list. Everything runs
with stub providers and no API keys for local dev.

Frontend: `VITE_API_URL` (baked at build; also written to
`public/runtime-config.json` by `scripts/write-runtime-config.js`).

## Commands

```bash
# frontend (repo root)
npm run dev            # Vite on :8080
npm run build          # runtime-config + vite build
npm run test           # vitest

# backend
npm run dev            # nest watch on :3000
npm run build          # prisma generate + nest build
npx jest               # unit tests
npx ts-node --transpile-only scripts/smoke.ts   # cumulative endpoint smoke test
npx prisma migrate deploy
```

## Testing

- Unit: `backend/src/**/*.spec.ts` — chunking invariants, embedding
  batching, RRF fusion, prompt role separation/history capping, cache
  cosine/normalization.
- `backend/scripts/smoke.ts` — cumulative black-box suite against a
  running stack: health, auth, JWT enforcement, upload validation,
  ingestion timing, IDOR, chat grounding, hostile input, SSE, cache hits,
  history follow-ups, delete cleanup. Generates its own PDF fixture.

## Migration invariants

`document_chunks.embedding` (vector), `content_tsv` (generated tsvector),
the HNSW index, and the GIN index are managed by raw SQL migrations that
Prisma cannot express. Review any `prisma migrate dev` diff before
applying — an auto-generated migration once dropped the HNSW index.
