# DocuMind (Insight Garden)

**DocuMind** is a document-centric RAG (Retrieval-Augmented Generation) SaaS application. Upload PDFs, process them into searchable chunks with vector embeddings, and chat with your documents using a local or cloud LLM—with streaming responses and source attribution.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io/)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Demo Walkthrough](#demo-walkthrough)
- [Known Limitations](#known-limitations)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **User auth** — Register, login, JWT-based sessions with optional persistence (localStorage).
- **Document upload** — PDF upload (drag-and-drop or file picker), 50MB limit, server-side validation.
- **Async processing** — BullMQ + Redis job queue: extract text → chunk → embed → store in pgvector.
- **RAG chat** — Per-document chat with retrieval over your chunks; configurable top-k and context caps.
- **Streaming** — SSE streaming for chat (Ollama); token-by-token display with throttled UI updates.
- **Source attribution** — Answers reference chunk indices; optional “show sources” in settings.
- **Settings** — Account info, preferences (auto-scroll, show sources, animations), system info (backend URL, version).
- **Health & errors** — Backend health check on app load; clear error messages for auth, network, and API failures.

---

## Tech Stack

### Frontend (repo root)

| Layer        | Technology |
|-------------|------------|
| Build       | [Vite](https://vitejs.dev/) 5 |
| Language    | [TypeScript](https://www.typescriptlang.org/) 5 |
| UI          | [React](https://react.dev/) 18 |
| Routing     | [React Router](https://reactrouter.com/) 6 |
| State       | [Zustand](https://zustand-demo.pmnd.rs/) 5 (auth, documents, chat, preferences; persist for auth/prefs) |
| Styling     | [Tailwind CSS](https://tailwindcss.com/) 3, [shadcn/ui](https://ui.shadcn.com/) (Radix primitives) |
| Animations  | [Framer Motion](https://www.framer.com/motion/) |
| Data fetch  | Native `fetch`; SSE via `fetch` + `ReadableStream` for streaming chat |
| Forms       | React Hook Form, Zod (optional) |
| Markdown    | react-markdown (chat messages) |
| Testing     | Vitest, Testing Library |

### Backend (`backend/`)

| Layer        | Technology |
|-------------|------------|
| Runtime     | [Node.js](https://nodejs.org/) (LTS) |
| Framework   | [NestJS](https://nestjs.com/) 11 |
| Language    | TypeScript 5 |
| API         | REST (Express); SSE for `/documents/:id/chat/stream` |
| Auth        | JWT (Passport + passport-jwt); bcrypt for passwords |
| Validation  | class-validator, class-transformer; global ValidationPipe |
| ORM / DB    | [Prisma](https://www.prisma.io/) 7 (PostgreSQL) |
| Vector DB  | [pgvector](https://github.com/pgvector/pgvector) (extension in Postgres) |
| Queue       | [BullMQ](https://docs.bullmq.io/) + Redis |
| File parse  | pdf-parse (PDF text extraction) |
| Embeddings  | Configurable: stub (dev) or OpenAI |
| LLM         | Configurable: stub, [Ollama](https://ollama.ai/) (streaming), or OpenAI (non-streaming) |
| Document status | Polling (frontend polls GET /documents/:id every 2s for in-progress docs) |
| Testing     | Jest, Supertest (e2e) |

### Infrastructure

| Component   | Technology |
|------------|------------|
| Database   | PostgreSQL 16 + pgvector (Docker **local only**; production uses managed Postgres) |
| Cache/Queue| Redis 7 (Docker **local only**; production uses managed Redis) |
| App hosts  | Backend and frontend run on the **host** (not in Docker); only Postgres and Redis are containerized locally |

**Local vs production:** Docker (this repo’s `docker-compose`) is for **local development only**. In production, use managed Postgres and Redis (e.g. Neon, RDS, Upstash, ElastiCache); backend and frontend are deployed to your chosen app hosts without Docker.

---

## Architecture

### High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Vite + React)                         │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │ Auth      │  │ Documents   │  │ Chat (SSE)  │  │ Settings / Prefs     │ │
│  │ Login/Reg │  │ Upload/List │  │ Stream      │  │ Zustand persist      │ │
│  └─────┬─────┘  └──────┬──────┘  └──────┬──────┘  └──────────────────────┘ │
│        │               │                │                                   │
│        │  JWT in Authorization header (or ?token= for SSE)                    │
└────────┼───────────────┼────────────────┼───────────────────────────────────┘
         │               │                │
         ▼               ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Backend (NestJS)                                 │
│  ┌──────────┐  ┌─────────────┐  ┌─────────────────────────────────────────┐│
│  │ Auth     │  │ Documents   │  │ RAG: Retrieval → Prompt → LLM → Answer   ││
│  │ JWT Guard│  │ Upload CRUD │  │ (streaming: SSE delta + done events)     ││
│  └──────────┘  └──────┬──────┘  └─────────────────────────────────────────┘│
│                       │                                                      │
│                       ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Jobs (BullMQ): PDF → text → chunk → embed → DocumentChunk (pgvector)    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└────────┬──────────────────────────────┬─────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│ PostgreSQL      │            │ Redis           │
│ + pgvector      │            │ (BullMQ)        │
└─────────────────┘            └─────────────────┘
```

### Data flow (simplified)

1. **Upload** — Client `POST /documents/upload` (multipart) → backend creates `Document` (PENDING), writes PDF to `uploads/<id>.pdf`, enqueues job.
2. **Process** — Worker: read PDF → extract text → chunk (fixed size + overlap) → embed (stub or OpenAI) → insert into `document_chunks` (pgvector) → set document status DONE (or FAILED).
3. **Chat** — Client `POST /documents/:id/chat/stream` with `{ question }` → backend: ownership + DONE check → embed query → similarity search (pgvector) → build RAG prompt → stream LLM tokens (Ollama) → SSE `delta` + `done` (with sources).

### Data-flow diagram (end-to-end)

```
  User                    Frontend                    Backend                     Storage
   │                         │                           │                            │
   │  1. Upload PDF          │                           │                            │
   │────────────────────────>│  POST /documents/upload    │                            │
   │                         │──────────────────────────>│  Create Document (PENDING)  │
   │                         │                           │  Write file → uploads/      │
   │                         │                           │  Enqueue job ──────────────┼──> Redis (BullMQ)
   │                         │<──────────────────────────│  Return document           │
   │                         │                           │                            │
   │                         │                     [Worker picks job]                   │
   │                         │                           │  Read PDF, chunk, embed     │
   │                         │                           │  INSERT document_chunks ───┼──> PostgreSQL (pgvector)
   │                         │                           │  UPDATE document → DONE     │
   │                         │                           │                            │
   │  2. Poll status (every 2s until DONE)                │                            │
   │                         │  GET /documents/:id       │                            │
   │                         │──────────────────────────>│                            │
   │                         │<──────────────────────────│  status, progress          │
   │                         │                           │                            │
   │  3. Ask question        │                           │                            │
   │────────────────────────>│  POST .../chat/stream     │                            │
   │                         │  { question }             │  Embed query               │
   │                         │──────────────────────────>│  Similarity search ────────┼──> pgvector
   │                         │                           │  Build prompt, stream LLM   │
   │                         │  SSE: event: delta        │<──────────────────────────│  (Ollama/OpenAI)
   │                         │<──────────────────────────│  event: done { sources }   │
   │  Streamed answer        │                           │                            │
   │<────────────────────────│                           │                            │
```

### Backend module boundaries

| Module     | Responsibility |
|-----------|----------------|
| `auth`    | Register, login, JWT issue/validate; no document logic. |
| `documents`| Upload, CRUD, ownership; delegates RAG to `rag-orchestrator` and retrieval to `retrieval`. |
| `chunks`  | Insert/delete document chunks (raw SQL for vector column). |
| `embedding`| Single provider (stub or OpenAI); consistent dimension. |
| `rag`     | Prompt building, LLM complete/stream (stub, Ollama, OpenAI). |
| `jobs`    | BullMQ processor: PDF → text → chunk → embed → chunks. |
| `health`  | Public `GET /health` for connectivity checks. |

### Frontend structure

- **Routes:** Public (/, /login, /register, landing); app layout (/app, /app/settings) and chat (/chat/:documentId) share sidebar layout.
- **State:** Zustand: one store for auth + documents + conversations + UI; separate store for preferences. Auth (and prefs) persisted; documents/chat refetched on load.
- **API:** Single `getApiBaseUrl()` / `getApiBaseUrlOrThrow()`; all fetch and SSE use it. No token refresh; 401 handled per request.

---

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or pnpm/yarn)
- **Docker** and **Docker Compose** (for Postgres and Redis only)
- **Ollama** (optional; for local LLM streaming). Install from [ollama.ai](https://ollama.ai/)

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_ORG/insight-garden.git
cd insight-garden
npm install
```

### 2. Start infrastructure

From the **repo root**:

```bash
docker compose up -d
```

- **PostgreSQL** (pgvector): port `5432`, user `user`, password `password`, database `insight_garden`.
- **Redis**: port `6379`.

### 3. Backend: env, migrate, run

```bash
cd backend
cp .env.example .env
# Edit .env: set JWT_SECRET (e.g. openssl rand -base64 32), DATABASE_URL, REDIS_HOST, REDIS_PORT, CORS_ORIGIN.
npx prisma migrate deploy
npm run dev
```

Backend runs at **http://localhost:3000**. It must be run from `backend/` so `process.cwd()` is correct for `.env` and `uploads/`.

### 4. Frontend: env and run

From the **repo root** (new terminal):

```bash
cp .env.example .env
# Set VITE_API_URL=http://localhost:3000 (optional if same host/port)
npm run dev
```

Frontend runs at **http://localhost:8080**.

### 5. Use the app

1. Open **http://localhost:8080**.
2. Register or log in.
3. Upload a PDF from the Documents page.
4. Wait for processing (progress bar); when status is “Ready”, open the document chat and ask questions.

For a step-by-step checklist, see [docs/LOCAL-DEV-SANITY-CHECKLIST.md](docs/LOCAL-DEV-SANITY-CHECKLIST.md).

---

## Demo walkthrough

Try DocuMind locally in under five minutes:

1. **Start infrastructure** (from repo root): `docker compose up -d`. Wait until Postgres and Redis are healthy.
2. **Backend**: `cd backend`, copy `.env.example` to `.env`, set `JWT_SECRET` (e.g. `openssl rand -base64 32`), `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `CORS_ORIGIN=http://localhost:8080`. Run `npx prisma migrate deploy` then `npm run dev`. Backend should log “Application is running on: http://localhost:3000”.
3. **Frontend**: From repo root, copy `.env.example` to `.env`, set `VITE_API_URL=http://localhost:3000`. Run `npm run dev`. Frontend runs at **http://localhost:8080**.
4. **Open** http://localhost:8080. You should see the landing page with no “Backend unreachable” banner.
5. **Register**: Click “Get Started” → create an account (name, email, password). You’re redirected to the Documents page.
6. **Upload**: Drag and drop a PDF (or click to browse). The document appears with a progress bar. Wait until status is **Ready** (processing usually takes 30–90 seconds for a few pages).
7. **Chat**: Click **Chat** on the document. Type a question (e.g. “What are the main points?”). Answers stream in and are grounded in your document; you can enable “Show sources under answers” in Settings.
8. **Optional**: For local streaming, install [Ollama](https://ollama.ai/) and run `ollama pull qwen2.5:7b`. Set `LLM_PROVIDER=ollama`, `OLLAMA_BASE_URL=http://localhost:11434`, `OLLAMA_MODEL=qwen2.5:7b` in `backend/.env` and restart the backend. Without Ollama, the app uses a stub LLM (placeholder responses).

---

## Known limitations

- **Local file storage** — PDFs are stored on disk (`uploads/`); no S3 or object storage yet.
- **Polling for document status** — The frontend polls `GET /documents/:id` every 2s for in-progress docs; no WebSocket push.
- **No refresh tokens** — JWT-only auth; tokens expire after 7 days (configurable). Re-login required after expiry.

---

## Environment Variables

### Frontend (repo root `.env`)

| Variable        | Required | Description |
|----------------|----------|-------------|
| `VITE_API_URL` | Yes      | Backend API base URL (e.g. `http://localhost:3000`). No trailing slash. |
| `VITE_APP_VERSION` | No   | App version string (default `0.0.0`). |

Vite only exposes variables prefixed with `VITE_`. Restart the dev server after changing `.env`.

### Backend (`backend/.env`)

| Variable              | Required | Description |
|-----------------------|----------|-------------|
| `DATABASE_URL`        | Yes      | PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/insight_garden`). |
| `JWT_SECRET`          | Yes      | Long random string for signing JWTs (e.g. `openssl rand -base64 32`). Must not be the literal `change-me-in-production`. |
| `REDIS_HOST`          | Yes      | Redis host (e.g. `localhost` when using Docker). |
| `REDIS_PORT`          | Yes      | Redis port (e.g. `6379`). |
| `PORT`                | No       | HTTP port (default `3000`). |
| `CORS_ORIGIN`         | No       | Allowed origin for CORS (default `http://localhost:8080`). |
| `JWT_EXPIRES_IN`      | No       | Token expiry in seconds (default `604800` = 7 days). |
| `EMBEDDING_PROVIDER`  | No       | `stub` or `openai`. |
| `EMBEDDING_DIMENSION`| No       | Vector dimension (default `1536`; must match migration). |
| `OPENAI_API_KEY`      | If OpenAI | For embeddings/LLM when using OpenAI. |
| `LLM_PROVIDER`        | No       | `stub`, `ollama`, or `openai`. |
| `OLLAMA_BASE_URL`     | No       | Ollama API URL (default `http://localhost:11434`). |
| `OLLAMA_MODEL`        | No       | Model name (e.g. `qwen2.5:7b`). |

See `backend/.env.example` for full comments and optional RAG/embedding/LLM variables.

---

## Project Structure

```
insight-garden/
├── src/                    # Frontend (Vite + React)
│   ├── components/        # UI: app (layout, sidebar, upload, cards), chat, landing, ui (shadcn)
│   ├── hooks/              # useBackendHealth, useToast, useMobile
│   ├── lib/                # api.ts (base URL, errors), sseChat.ts, utils
│   ├── pages/              # Index, Login, Register, Dashboard, ChatPage, SettingsPage, NotFound, etc.
│   ├── stores/             # useAppStore (auth, documents, chat), usePreferencesStore
│   └── main.tsx, App.tsx
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma   # User, Document, DocumentChunk (pgvector)
│   │   └── migrations/
│   └── src/
│       ├── auth/           # Register, login, JWT strategy/guard
│       ├── documents/      # Controller, service, retrieval, RAG orchestrator, DTOs
│       ├── chunks/         # DocumentChunkService (pgvector inserts/deletes)
│       ├── embedding/     # Stub / OpenAI
│       ├── rag/            # Prompt, LLM (stub, Ollama, OpenAI)
│       ├── jobs/           # BullMQ document processor (PDF → chunk → embed)
│       ├── health/         # GET /health
│       ├── common/          # @Public(), @CurrentUser(), HttpExceptionFilter
│       ├── lib/             # chunking.ts
│       └── main.ts, app.module.ts
├── docs/                   # LOCAL-DEV-SANITY-CHECKLIST, INCIDENT-*, TECHNICAL-AUDIT
├── docker-compose.yml     # Postgres (pgvector) + Redis only
├── .env.example            # Frontend env template
└── package.json           # Frontend deps and scripts
```

---

## Available Scripts

### Repo root (frontend)

| Script        | Description |
|---------------|-------------|
| `npm run dev` | Start Vite dev server (port 8080). |
| `npm run build`| Production build. |
| `npm run preview` | Preview production build. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run Vitest. |

### Backend (`backend/`)

| Script           | Description |
|------------------|-------------|
| `npm run dev`   | Start NestJS in watch mode (port 3000). |
| `npm run build` | Compile to `dist/`. |
| `npm run start` | Run compiled app. |
| `npm run lint`  | Run ESLint. |
| `npm run test`  | Unit tests (Jest). |
| `npm run test:e2e` | E2E tests. |
| `npx prisma migrate dev` | Apply migrations (dev). |
| `npx prisma migrate deploy` | Apply migrations (prod). |
| `npx prisma studio` | Open Prisma Studio for DB inspection. |

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/LOCAL-DEV-SANITY-CHECKLIST.md](docs/LOCAL-DEV-SANITY-CHECKLIST.md) | Step-by-step local dev verification (env, Docker, auth, CORS, errors). |
| [docs/INCIDENT-AUTH-SSE-FIX.md](docs/INCIDENT-AUTH-SSE-FIX.md) | Post-mortem and fix plan for auth/SSE/env (rehydration, CORS, JWT). |
| [docs/TECHNICAL-AUDIT.md](docs/TECHNICAL-AUDIT.md) | Full technical audit: architecture, auth, data flow, streaming, state, UX, DX; P0/P1/P2 and next steps. |
| [backend/README.md](backend/README.md) | Backend-specific setup and NestJS notes. |
| [backend/.env.example](backend/.env.example) | Backend env template with comments. |

---

## Contributing

We welcome contributions. For detailed guidelines (setup, branching, PR process, code style, testing), see **[CONTRIBUTING.md](CONTRIBUTING.md)**.

### Code of conduct

- Be respectful and inclusive.
- Focus on constructive feedback and clear, factual discussions.

### How to contribute

1. **Fork** the repository and clone your fork.
2. **Create a branch** from `main` (e.g. `feature/short-feature-name` or `fix/bug-description`).
3. **Make your changes** — keep commits focused and messages clear (e.g. “Add protected routes for /app and /chat”).
4. **Run checks** — from repo root: `npm run lint` and `npm run test`; from `backend/`: `npm run lint` and `npm run test`. Ensure migrations apply if you change the schema.
5. **Push** to your fork and open a **Pull Request** against `main`.
6. **Describe** what you changed and why; reference any issues if applicable.
7. Address review feedback; maintainers will merge when the PR is approved and CI (if any) passes.

### Branch naming

- `feature/<name>` — New features.
- `fix/<name>` — Bug fixes.
- `docs/<name>` — Documentation only.
- `chore/<name>` — Tooling, deps, config.

### Code style

- **Frontend:** TypeScript strict; follow existing patterns (Zustand, React hooks, path alias `@/`). Use the project’s ESLint/Prettier config.
- **Backend:** NestJS style; DTOs with class-validator; use existing modules and guards. Use the backend’s ESLint/Prettier config.

### Scope

- For large or breaking changes, open an **Issue** first to discuss approach and scope.
- For small fixes (typos, docs, config), a direct PR is fine.

---

## License

This project is currently unlicensed. All rights reserved. If you need a license for use or contribution, please open an issue to discuss.

---

**DocuMind (Insight Garden)** — Document RAG with streaming chat, pgvector retrieval, and configurable embeddings/LLM.
