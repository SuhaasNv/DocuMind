# DocuMind

> **AI-powered document intelligence.** Upload PDFs, chat with your documents, and get accurate answers grounded in your content—powered by RAG, vector search, and streaming AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io/)

**Live demo:** [documind-web-production.up.railway.app](https://documind-web-production.up.railway.app)

**Production stack:** All on [Railway](https://railway.app/) — Frontend (nginx static) · Backend (NestJS) · PostgreSQL + pgvector · Redis · Chat + embeddings → [OpenAI](https://platform.openai.com/)

---

## Screenshots

*User journey: Landing → Features → Pricing → Sign in → Dashboard → Chat → Settings*

<p align="center">
  <strong>1. Landing Hero</strong><br>
  <img src="images/landing 1.png" alt="Landing hero with 3D scene and CTAs" width="800">
</p>

<p align="center">
  <strong>2. Features Overview</strong><br>
  <img src="images/landing2.png" alt="Features: Upload PDFs, RAG, AI Chat, Security" width="800">
</p>

<p align="center">
  <strong>3. Pricing</strong><br>
  <img src="images/pricing.png" alt="Pricing tiers: Free, Pro, Enterprise" width="800">
</p>

<p align="center">
  <strong>4. Sign In</strong><br>
  <img src="images/signin.png" alt="Sign in form" width="800">
</p>

<p align="center">
  <strong>5. Documents Dashboard</strong><br>
  <img src="images/dashboard.png" alt="Upload area and document list" width="800">
</p>

<p align="center">
  <strong>6. Chat — Asking a question</strong><br>
  <img src="images/question1.png" alt="User asks question about document" width="800">
</p>

<p align="center">
  <strong>7. Chat — AI answer with sources</strong><br>
  <img src="images/answer1.png" alt="AI response with source citations" width="800">
</p>

<p align="center">
  <strong>8. Settings</strong><br>
  <img src="images/settings.png" alt="Account, security, and preferences" width="800">
</p>

---

## Features

| Feature | Description |
|--------|--------------|
| **PDF Upload** | Drag-and-drop or file picker. 50MB limit. Server-side validation. |
| **Fast Ingestion** | BullMQ workers with batched embeddings and bulk inserts (~7× faster than the naive loop). Token-aware recursive chunking (paragraphs → sentences → token cuts) with overlap. Live progress. |
| **Hybrid Retrieval** | pgvector cosine search (HNSW index) fused with Postgres full-text search (tsvector + GIN) via Reciprocal Rank Fusion. Sources show real similarity scores. |
| **Grounded RAG Chat** | Per-document chat with strict grounding rules and role-separated prompts. Conversation memory: follow-ups like "tell me more about it" resolve against prior turns. |
| **Inline Citations + PDF Viewer** | Answers render inline `[n]` markers; clicking one opens the original PDF (react-pdf) scrolled to the cited page. Chunks are page-aware; `GET /documents/:id/file` streams the source. |
| **Streaming Responses** | SSE streaming with batched UI updates. Answers keep generating in the background if you navigate away — like ChatGPT/Claude. Mid-stream provider errors are surfaced, never silently truncated. |
| **Answer Cache** | Two-layer Redis cache (exact + semantic-similarity). Repeat questions answer in ~300ms, replayed over the same streaming protocol. Invalidated on re-processing and deletion. |
| **Instant Activation** | Ready documents offer a generated summary, suggested-question chips, and follow-up chips after each answer — no blank page. |
| **Collections & Cross-Document Chat** | Group documents into collections and chat across all of them at once; retrieval fans out and fuses results from multiple PDFs. |
| **Knowledge Garden** | Pin answers into a personal, searchable library and export it as markdown. |
| **Shareable Answers** | Publish an answer to a public link (`/s/:token`) as a frozen snapshot — question, answer, and sources — with revoke and expiry controls. |
| **Retrieval Transparency** | Per-answer debug panel: candidate chunk scores, cache status (exact/semantic/miss), and stage timings, backed by always-on chat telemetry. |
| **Source Attribution** | Toggleable "show sources": each answer cites the chunks it was grounded in, with similarity scores and snippets. |
| **User Auth** | Register, login, change password, JWT sessions. Rate-limited auth endpoints; ownership enforced on every document route. |
| **Settings & Preferences** | Auto-scroll, sources, animations, typewriter effect, clear chat history, API tokens — all functional and persisted. |
| **Admin Console** | User/document search, job retry/clean, document delete/reprocess, real analytics (cache-hit-rate, token cost), admin audit log, last-admin protection, and complete user deletion — behind role-based access. |
| **MCP Connector** | Personal API tokens (`dm_...`) and a `POST /mcp` Streamable HTTP endpoint expose three read-only tools (`list_documents`, `search_documents`, `ask_document`) to Claude and any MCP client. |
| **Modern Landing** | Spline 3D scene, spotlight effects, Framer Motion animations. Mobile-responsive throughout. |

---

## Tech Stack

### Frontend

| Layer | Technology |
|-------|------------|
| Build | [Vite](https://vitejs.dev/) 5 |
| UI | [React](https://react.dev/) 18, [TypeScript](https://www.typescriptlang.org/) 5 |
| Routing | [React Router](https://reactrouter.com/) 6 |
| State | [Zustand](https://zustand-demo.pmnd.rs/) 5 (auth, documents, chat, preferences; persist for auth/prefs) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 3, [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| Animations | [Framer Motion](https://www.framer.com/motion/) |
| 3D | [Spline](https://spline.design/) (React runtime) |
| Data | [TanStack Query](https://tanstack.com/query) (React Query) over native `fetch`; SSE via `fetch` + `ReadableStream` for streaming chat |
| PDF | [react-pdf](https://github.com/wojtekmaj/react-pdf) (inline viewer, citation page jumps) |
| Markdown | react-markdown (chat messages) |
| Charts | Recharts |
| Testing | Vitest, Testing Library |

### Backend

| Layer | Technology |
|-------|------------|
| Framework | [NestJS](https://nestjs.com/) 11 |
| API | REST (Express); SSE for `/documents/:id/chat/stream` |
| Auth | JWT (Passport + passport-jwt); bcrypt for passwords |
| Validation | class-validator, class-transformer; global ValidationPipe |
| ORM / DB | [Prisma](https://www.prisma.io/) 7 (PostgreSQL) |
| Vector DB | [pgvector](https://github.com/pgvector/pgvector) (extension in Postgres) |
| Queue | [BullMQ](https://docs.bullmq.io/) + Redis |
| File Parse | pdf-parse (PDF text extraction) |
| Embeddings | **OpenAI** `text-embedding-3-small` (batched); stub for keyless local dev |
| LLM | **OpenAI** `gpt-4o-mini` (role-separated messages, streaming); Gemini, Ollama, or stub selectable |
| Tokenization | gpt-tokenizer (cl100k_base) for chunking and history budgets |
| Cache | Two-layer Redis chat cache (exact + semantic) |
| MCP | [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — `POST /mcp` Streamable HTTP, API-token auth |

### Infrastructure

| Component | Local | Production |
|-----------|-------|------------|
| **Frontend** | Vite dev server (port 8080) | [Railway](https://railway.app/) (nginx static container) |
| **Backend** | NestJS (port 3000) | [Railway](https://railway.app/) |
| **Database** | Railway PostgreSQL 16 + pgvector | [Railway](https://railway.app/) (pgvector/pgvector:pg16) |
| **Cache/Queue** | Railway Redis (public TCP proxy) | [Railway](https://railway.app/) Redis |

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Docker** and **Docker Compose** (for local Postgres and Redis)
- **OpenAI API key** — optional; everything runs with `stub` providers and no keys for local dev

### 1. Clone and install

```bash
git clone https://github.com/SuhaasNv/DocuMind.git
cd DocuMind
npm install
```

### 2. Start infrastructure

From the **repo root**:

```bash
docker compose up -d
```

- **PostgreSQL** (pgvector): port `5432`, user `user`, password `password`, database `insight_garden`
- **Redis**: port `6379`

### 3. Backend setup

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/insight_garden` |
| `JWT_SECRET` | Long random string (e.g. `openssl rand -base64 32`) |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` (or a full `REDIS_URL`) |
| `CORS_ORIGIN` | `http://localhost:8080` |
| `LLM_PROVIDER` / `EMBEDDING_PROVIDER` | `stub` works with no keys; set both to `openai` + `OPENAI_API_KEY` for real answers |

Then:

```bash
npx prisma migrate deploy
npm run dev
```

Backend runs at **http://localhost:3000**.

### 4. Frontend setup

From the **repo root** (new terminal):

```bash
cp .env.example .env
# Ensure VITE_API_URL=http://localhost:3000
npm run dev
```

Frontend runs at **http://localhost:8080**.

### 5. Use the app

1. Open **http://localhost:8080**
2. Register or log in
3. Upload a PDF from the Documents page
4. Wait for processing (progress bar); when status is **Ready**, open the document chat and ask questions

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Frontend (Vite + React)                              │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Auth     │  │ Documents   │  │ Chat (SSE)   │  │ Settings / Prefs     │  │
│  │ JWT      │  │ Upload/List │  │ Streaming    │  │ Zustand persist      │  │
│  └────┬─────┘  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘  │
└───────┼───────────────┼────────────────┼────────────────────────────────────┘
        │               │                │
        ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend (NestJS)                                     │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────────────────────────────────┐ │
│  │ Auth     │  │ Documents   │  │ RAG: Cache → Retrieve → Prompt → LLM      │ │
│  │ JWT      │  │ Upload CRUD │  │ (streaming: SSE delta + done events)     │ │
│  └──────────┘  └──────┬──────┘  └─────────────────────────────────────────┘ │
│                       │                                                      │
│                       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Jobs (BullMQ): PDF → text → chunk → embed → DocumentChunk (pgvector)    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└───────┬──────────────────────────────┬──────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│ PostgreSQL      │            │ Redis           │
│ + pgvector      │            │ (BullMQ + cache)│
└─────────────────┘            └─────────────────┘
```

### Data flow

1. **Upload** — `POST /documents/upload` → create Document (PENDING) → enqueue job
2. **Process** — Worker: PDF → text → token-aware chunks → batched embeddings → bulk insert into `document_chunks` (pgvector) → status DONE
3. **Chat** — `POST /documents/:id/chat/stream` → cache check (exact, then semantic) → on miss: hybrid retrieval (pgvector + full-text, RRF-fused) → role-separated prompt with conversation history → stream LLM tokens via SSE → cache the answer

---

## Environment Variables

### Frontend (repo root `.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Backend API base URL (e.g. `http://localhost:3000`). No trailing slash. |
| `VITE_APP_VERSION` | No | App version string (default `0.0.0`). |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (also accepts `DATABASE_PRIVATE_URL`/`DATABASE_PUBLIC_URL`). |
| `JWT_SECRET` | Yes | Long random string (e.g. `openssl rand -base64 32`). Must not be the default. |
| `REDIS_HOST` / `REDIS_PORT` | Yes* | Redis for BullMQ. Local: `localhost`, `6379`. |
| `REDIS_URL` | Yes* | Alternative: full Redis URL (`redis://` or `rediss://`; path selects the logical DB). |
| `CORS_ORIGIN` | No | Allowed origin (default `http://localhost:8080`). |
| `PORT` | No | HTTP port (default `3000`). |
| `LLM_PROVIDER` | No | `stub` (default, keyless), `openai`, `gemini`, or `ollama`. Production uses `openai`. |
| `EMBEDDING_PROVIDER` | No | `stub` (default) or `openai`. Production uses `openai`. |
| `OPENAI_API_KEY` | If OpenAI | Used for both chat and embeddings. |
| `CHAT_CACHE_TTL_SECONDS` | No | Chat cache TTL (default `3600`). |
| `CHAT_CACHE_SEMANTIC_THRESHOLD` | No | Semantic-hit cosine threshold (default `0.95`). |
| `HISTORY_MAX_TOKENS` | No | Token budget for conversation history in prompts (default `1000`). |
| `CONTEXTUAL_RETRIEVAL` | No | `true` prepends an LLM-generated situating sentence to each chunk at ingestion (default off). |

See `backend/.env.example` for full options (Gemini, Ollama, dimensions, context caps).

---

## Project Structure

```
insight-garden/
├── src/                      # Frontend (Vite + React)
│   ├── components/
│   │   ├── app/              # Layout, sidebar, upload, cards, empty states
│   │   ├── chat/             # MessageBubble, ChatInput, TypingIndicator
│   │   ├── landing/          # Hero, Features, CTA, Footer, Navbar, PublicLayout
│   │   └── ui/               # shadcn, Spline, Spotlight, TubelightNav
│   ├── hooks/                # useBackendHealth, useToast, useMobile, useReducedMotion
│   ├── lib/                  # api.ts, sseChat.ts, chatStream.ts (background streams), utils
│   ├── pages/                # Index, Login, Register, Dashboard, ChatPage, GardenPage, SharePage, Settings, AdminDashboard, etc.
│   └── stores/               # useAppStore, usePreferencesStore
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     # User, Document, DocumentChunk, Collection, Insight, SharedAnswer, Conversation, AdminAuditLog, ApiToken
│   │   └── migrations/
│   └── src/
│       ├── auth/             # Register, login, JWT strategy/guard
│       ├── documents/        # Controller, service, retrieval, RAG orchestrator, file streaming
│       ├── collections/      # Collections + cross-document chat
│       ├── conversations/    # Server-side conversation persistence
│       ├── insights/         # Knowledge garden (pinned answers, export)
│       ├── share/            # Public answer snapshots (/s/:token)
│       ├── me/               # Home hub stats (/me/stats)
│       ├── chat/             # Chat telemetry
│       ├── chunks/            # DocumentChunkService (pgvector)
│       ├── embedding/        # Embedding service
│       ├── rag/              # Prompt, LLM service, chat cache, Gemini client
│       ├── jobs/              # BullMQ document processor
│       ├── admin/            # Admin console + audit log
│       ├── api-tokens/       # Personal API tokens (dm_...)
│       ├── mcp/              # MCP Streamable HTTP endpoint (POST /mcp)
│       ├── health/            # GET /health
│       └── ../scripts/smoke.ts # Cumulative end-to-end smoke suite
├── docker-compose.yml        # Postgres (pgvector) + Redis
└── package.json              # Frontend deps and scripts
```

---

## Scripts

### Frontend (repo root)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server (port 8080) |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest |

### Backend (`backend/`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Start NestJS in watch mode (port 3000) |
| `npm run build` | Compile to `dist/` |
| `npm run start` | Run compiled app |
| `npm run lint` | Run ESLint |
| `npm run test` | Unit tests (Jest) — chunking, RRF fusion, prompts, cache, embeddings |
| `npx ts-node --transpile-only scripts/smoke.ts [url]` | End-to-end smoke suite (25 checks) against a running stack |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma studio` | Open Prisma Studio |

---

## Performance & Quality

Measured on the same 10-page PDF, verified by the cumulative smoke suite
([PHASES.md](PHASES.md) has the full per-phase breakdown):

| Metric | Before | After |
|--------|--------|-------|
| Ingestion (upload → ready) | 49.4s | **7.3s local / 4.1s prod** |
| Repeat question (cache hit) | full LLM round trip | **~320ms** |
| Dense retrieval | sequential scan (index had been dropped) | HNSW index |
| Lexical retrieval | unindexed `ILIKE` scan | tsvector + GIN, `ts_rank_cd` |
| Source scores | always `1.0` (min-max artifact) | real cosine similarity |

Every change passed a verification gate: zero TypeScript errors, 30 unit
tests, zero-error ESLint, and a 25-check black-box smoke suite covering
auth, JWT enforcement, IDOR, upload validation, hostile input, SSE
streaming, caching, conversation history, and cleanup — run against both
local and production.

---

## Deployment

**Production:** Everything runs on Railway — frontend, backend, PostgreSQL (pgvector), and Redis in one project.

1. **Database** — Add a Railway service from the `pgvector/pgvector:pg16` image with a volume; migrations run automatically on backend deploy (`prisma migrate deploy`)
2. **Redis** — Add Railway's Redis database; the backend reads `REDIS_URL`
3. **Backend** — Deploy `backend/` (Dockerfile, see `backend/railway.toml`); set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `REDIS_URL`, `LLM_PROVIDER`, `OPENAI_API_KEY`
4. **Frontend** — Deploy the repo root Dockerfile (nginx static); set the `VITE_API_URL` build arg to the backend's public URL

See [docs/CASE-STUDY-DEPLOYMENT.md](docs/CASE-STUDY-DEPLOYMENT.md) for a full deployment walkthrough.

---

## Connect to Claude

DocuMind exposes an MCP (Model Context Protocol) server at `POST /mcp`, authenticated with personal API tokens (`Settings → API Tokens`, format `dm_...`, shown once at creation). It offers three read-only tools: `list_documents`, `search_documents`, and `ask_document`.

- **claude.ai** — Settings → Connectors → Add custom connector → paste `https://<backend>/mcp` and authorize with your token
- **Claude Code** — `claude mcp add --transport http documind https://<backend>/mcp --header "Authorization: Bearer dm_..."`
- **Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "documind": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<backend>/mcp", "--header", "Authorization: Bearer dm_..."]
    }
  }
}
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [PHASES.md](PHASES.md) | The phased upgrade roadmap (Phases 1–15 + hardening) with measured before/after numbers |
| [CODEBASE_DOCUMENTATION.md](CODEBASE_DOCUMENTATION.md) | Architecture reference generated from the current code |
| [docs/CASE-STUDY-DEPLOYMENT.md](docs/CASE-STUDY-DEPLOYMENT.md) | Historical deployment case study (pre-Railway migration) |
| [docs/LOCAL-DEV-SANITY-CHECKLIST.md](docs/LOCAL-DEV-SANITY-CHECKLIST.md) | Step-by-step local dev verification |
| [docs/TECHNICAL-AUDIT.md](docs/TECHNICAL-AUDIT.md) | Technical audit and architecture notes |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines |

---

## Contributing

We welcome contributions. See **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup, branching, PR process, and code style.

---

## License

This project is currently unlicensed. All rights reserved.

---

**DocuMind** — Chat with your documents. Powered by RAG, pgvector, and OpenAI.
