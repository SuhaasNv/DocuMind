# DocuMind

> **AI-powered document intelligence.** Upload PDFs, chat with your documents, and get accurate answers grounded in your content—powered by RAG, vector search, and streaming AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs)](https://nestjs.com/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite)](https://vitejs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io/)

**Production stack:** Frontend → [Vercel](https://vercel.com/) · Backend → [Railway](https://railway.app/) · Database → [Supabase](https://supabase.com/) · Redis → [Upstash](https://upstash.com/) · LLM → [Google Gemini](https://ai.google.dev/)

---

## Features

| Feature | Description |
|--------|--------------|
| **PDF Upload** | Drag-and-drop or file picker. 50MB limit. Server-side validation. |
| **Real-time Processing** | BullMQ + Redis job queue. Extract text → chunk → embed → store in pgvector. Live progress updates. |
| **RAG Chat** | Per-document chat with retrieval over your chunks. Configurable top-k and context caps. Answers cite your document, not generic knowledge. |
| **Streaming Responses** | SSE streaming for chat. Token-by-token display with throttled UI updates. |
| **Source Attribution** | Optional “show sources” in settings. Answers reference chunk indices. |
| **User Auth** | Register, login, JWT-based sessions with optional persistence (localStorage). |
| **Settings & Preferences** | Account info, auto-scroll, show sources, animations, system info (backend URL, version). |
| **Health & Errors** | Backend health check on app load. Clear error messages for auth, network, and API failures. |
| **Mobile-responsive UI** | Responsive landing, tubelight navbar, sheet-based mobile nav. Works on all screen sizes. |
| **Modern Landing** | Spline 3D scene, spotlight effects, mouse-following blob, Framer Motion animations. |

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
| Data | Native `fetch`; SSE via `fetch` + `ReadableStream` for streaming chat |
| Forms | React Hook Form, Zod |
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
| Embeddings | Configurable (stub or OpenAI) |
| LLM | **Gemini** (default, streaming), Ollama, or OpenAI |

### Infrastructure

| Component | Local | Production |
|-----------|-------|------------|
| **Frontend** | Vite dev server (port 8080) | [Vercel](https://vercel.com/) |
| **Backend** | NestJS (port 3000) | [Railway](https://railway.app/) |
| **Database** | PostgreSQL 16 + pgvector (Docker) | [Supabase](https://supabase.com/) |
| **Cache/Queue** | Redis 7 (Docker) | [Upstash](https://upstash.com/) |

---

## Quick Start

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **Docker** and **Docker Compose** (for Postgres and Redis)
- **Gemini API key** (optional for local LLM; get one at [Google AI Studio](https://aistudio.google.com/apikey))

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
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/insight_garden` (or your Supabase URL) |
| `JWT_SECRET` | Long random string (e.g. `openssl rand -base64 32`) |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |
| `CORS_ORIGIN` | `http://localhost:8080` |
| `GEMINI_API_KEY` | Your Gemini API key (for RAG chat) |

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
│  │ Auth     │  │ Documents   │  │ RAG: Retrieval → Prompt → Gemini → Answer │ │
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
│ + pgvector      │            │ (BullMQ)        │
└─────────────────┘            └─────────────────┘
```

### Data flow

1. **Upload** — `POST /documents/upload` → create Document (PENDING) → enqueue job
2. **Process** — Worker: PDF → text → chunk → embed → insert into `document_chunks` (pgvector) → status DONE
3. **Chat** — `POST /documents/:id/chat/stream` → embed query → similarity search → RAG prompt → stream Gemini tokens via SSE

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
| `DATABASE_URL` | Yes | PostgreSQL connection string. Add `?sslmode=require` for Supabase. |
| `JWT_SECRET` | Yes | Long random string (e.g. `openssl rand -base64 32`). Must not be the default. |
| `REDIS_HOST` / `REDIS_PORT` | Yes* | Redis for BullMQ. Local: `localhost`, `6379`. |
| `REDIS_URL` | Yes* | Alternative: full Redis URL (e.g. Upstash `rediss://...`). |
| `CORS_ORIGIN` | No | Allowed origin (default `http://localhost:8080`). |
| `PORT` | No | HTTP port (default `3000`). |
| `LLM_PROVIDER` | No | `gemini` (default), `ollama`, `openai`, or `stub`. |
| `GEMINI_API_KEY` | If Gemini | API key from [Google AI Studio](https://aistudio.google.com/apikey). |
| `GEMINI_MODEL` | No | Model name (default `gemini-2.5-flash`). |

See `backend/.env.example` for full options (Ollama, OpenAI, embeddings).

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
│   ├── lib/                  # api.ts, sseChat.ts, utils
│   ├── pages/                # Index, Login, Register, Dashboard, ChatPage, Settings, etc.
│   └── stores/               # useAppStore, usePreferencesStore
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma     # User, Document, DocumentChunk (pgvector)
│   │   └── migrations/
│   └── src/
│       ├── auth/             # Register, login, JWT strategy/guard
│       ├── documents/        # Controller, service, retrieval, RAG orchestrator
│       ├── chunks/            # DocumentChunkService (pgvector)
│       ├── embedding/        # Embedding service
│       ├── rag/              # Prompt, Gemini client, LLM service
│       ├── jobs/              # BullMQ document processor
│       └── health/            # GET /health
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
| `npm run test` | Unit tests (Jest) |
| `npx prisma migrate deploy` | Apply migrations |
| `npx prisma studio` | Open Prisma Studio |

---

## Deployment

**Production:** Frontend on Vercel, Backend on Railway, Database on Supabase, Redis on Upstash.

1. **Database** — Create Supabase project, copy connection string, add `?sslmode=require`, run `npx prisma migrate deploy`
2. **Redis** — Create Upstash Redis, copy `REDIS_URL`
3. **Backend** — Deploy to Railway, set `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `REDIS_URL`, `GEMINI_API_KEY`
4. **Frontend** — Deploy to Vercel, set `VITE_API_URL` to your Railway backend URL

See [docs/CASE-STUDY-DEPLOYMENT.md](docs/CASE-STUDY-DEPLOYMENT.md) for a full deployment walkthrough.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/CASE-STUDY-DEPLOYMENT.md](docs/CASE-STUDY-DEPLOYMENT.md) | Production deployment with Vercel, Railway, Supabase, Upstash |
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

**DocuMind** — Chat with your documents. Powered by RAG, pgvector, and Gemini.
