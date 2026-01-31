# Case Study: Deploying DocuMind (Insight Garden) to Production

**Document:** Deployment case study  
**Scope:** Full-stack deployment (frontend, backend, database, Redis) with Vercel, Railway, Supabase, and Upstash  
**Outcome:** Production app with auth, document upload, async processing, and RAG chat

---

## 1. Context

**DocuMind** is a document RAG (Retrieval-Augmented Generation) SaaS: users upload PDFs, the system chunks and embeds them (pgvector), and users chat with documents via a configurable LLM. The stack is:

- **Frontend:** Vite + React (TypeScript), Zustand, shadcn/ui  
- **Backend:** NestJS, Prisma, PostgreSQL (pgvector), BullMQ + Redis, JWT auth  
- **Infrastructure (local):** Docker Compose for Postgres + Redis; backend and frontend on host

The goal was to deploy this app so it works in production with the same behavior as local: same URLs and configuration patterns, minimal divergence between dev and prod.

---

## 2. Target Architecture

We chose a split-stack that keeps frontend, backend, database, and queue as separate managed services:

| Layer      | Provider   | Role |
|-----------|------------|------|
| Frontend  | **Vercel** | SPA (React); env var `VITE_API_URL` points to backend |
| Backend   | **Railway**| NestJS API; needs `DATABASE_URL`, `JWT_SECRET`, `REDIS_URL`, `CORS_ORIGIN` |
| Database  | **Supabase** | PostgreSQL + pgvector; single `DATABASE_URL` for backend |
| Redis     | **Upstash**  | BullMQ job queue for document processing (chunk → embed → store) |

**Design principle:** Same logical flow as local (frontend → backend → DB/Redis), with URLs and secrets supplied via environment variables per environment.

---

## 3. Issues Encountered and Resolutions

### 3.1 Backend failing to start: missing env

**Symptom:** Railway logs showed repeated:

```text
[FATAL] Missing required environment variables: DATABASE_URL. Set them in .env (see .env.example).
```

**Cause:** Backend validates `DATABASE_URL` and `JWT_SECRET` at startup; in Railway, variables must be set in the **backend service** Variables tab, not only in the repo or in a different service.

**Resolution:**

- In Railway → backend service → **Variables**, set:
  - **DATABASE_URL** — Supabase connection string (see §3.4).
  - **JWT_SECRET** — long random string (e.g. `openssl rand -base64 32`).
- Redeploy the backend.

**Takeaway:** Required env vars must exist on the **service** that runs the process; names must match exactly (e.g. `DATABASE_URL`, not `POSTGRES_URL` unless the app reads that).

---

### 3.2 “Backend unreachable” / “Failed to fetch” from Vercel

**Symptom:** Deployed frontend showed “Backend unreachable at https://documind-production.up.railway.app” and “Failed to fetch”.

**Causes (two):**

1. **Wrong backend URL at build time**  
   Vite bakes `VITE_API_URL` into the bundle at **build** time. If Vercel built without `VITE_API_URL` (or with `http://localhost:3000`), the production app kept calling the wrong URL.

2. **CORS**  
   Backend defaulted to allowing only `http://localhost:8080`. Requests from `https://docu-mind-delta.vercel.app` were rejected by the browser (CORS), which surfaces as “Failed to fetch”.

**Resolutions:**

1. **Frontend URL:**
   - In Vercel → project → **Settings** → **Environment Variables**, set **VITE_API_URL** = backend URL (e.g. `https://documind-production.up.railway.app`), no trailing slash.
   - **Redeploy** the frontend so the new build embeds this URL (and the runtime config file, see below).

2. **Runtime config (defense in depth):**  
   A build script was added that writes `public/runtime-config.json` from `VITE_API_URL` during `npm run build`. The frontend loads this file at runtime (in production) and uses its `apiUrl` as the backend base URL. So even if build-time env was wrong once, a redeploy with correct `VITE_API_URL` fixes it; in development we skip this file and use `.env` only.

3. **CORS on backend:**  
   Backend CORS was updated to:
   - Accept a comma-separated **CORS_ORIGIN** list.
   - **Allow all `*.vercel.app` and `*.railway.app` origins** in code, so any Vercel/Railway deployment works without editing CORS for each subdomain.
   - On Railway, **CORS_ORIGIN** was set to the exact frontend origin (e.g. `https://docu-mind-delta.vercel.app`) for explicitness.

**Takeaway:** For SPAs calling a different origin, (1) set the API base URL in the frontend build env and redeploy, and (2) allow that origin (or a pattern) in backend CORS. Runtime config adds resilience to build-time mistakes.

---

### 3.3 “Application failed to respond” (Railway)

**Symptom:** Opening `https://documind-production.up.railway.app/health` showed Railway’s “Application failed to respond” page.

**Cause:** The backend process was not running or not listening—e.g. still exiting on startup due to missing/wrong `DATABASE_URL` or DB unreachable.

**Resolution:**

- Fix **DATABASE_URL** and **JWT_SECRET** on Railway (see §3.1).
- Ensure the backend service has a **generated domain** (Railway → backend → Settings → Networking → Generate Domain).
- Check **Deploy logs** for the backend; resolve any `[FATAL]` or Prisma connection errors.

**Takeaway:** “Application failed to respond” means the app never served traffic; always check deploy logs and required env first.

---

### 3.4 Database: “Can’t reach database server” (Supabase P1001)

**Symptom:** Running `npx prisma migrate deploy` (from `backend/`) failed with:

```text
Error: P1001: Can't reach database server at `db.xxx.supabase.co:5432`
```

**Causes:**

1. **No SSL** — Supabase requires SSL; the connection string must include `?sslmode=require`.
2. **Wrong .env location** — Prisma was not loading `backend/.env` when run from the right directory; the config was updated to load `.env` from `process.cwd()` so that running from `backend/` uses `backend/.env`.
3. **Paused project** — Supabase free tier can pause projects; the project must be “Restored” in the dashboard.

**Resolution:**

- **DATABASE_URL** format for Supabase:
  - Get the URI from Supabase Dashboard → Settings → Database (replace `[YOUR-PASSWORD]` with the real DB password).
  - Append `?sslmode=require` (e.g. `postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres?sslmode=require`).
  - If the password has special characters, URL-encode them.
- Ensure the Supabase project is **active** (restore if paused).
- Run migrations from `backend/`: `npx prisma migrate deploy` (with `DATABASE_URL` in `backend/.env` or in the environment).

**Takeaway:** Managed Postgres often requires SSL and an explicit param; confirm the exact connection string format and that the app loads the correct `.env` for the command (e.g. from `backend/`).

---

### 3.5 “Internal server error” on login / register

**Symptom:** Login or register returned 500 “Internal server error”.

**Cause:** The database was reachable but **tables did not exist** (migrations had not been run against the production Supabase DB). Prisma threw; the global exception filter returned 500 with a generic message.

**Resolution:**

- Run migrations against the production DB: from `backend/` with `DATABASE_URL` pointing at Supabase, run `npx prisma migrate deploy`.
- **Code:** Auth service was updated to wrap DB calls in try/catch and map Prisma errors (e.g. connection, missing table) to **503** with a clear message (e.g. “Database error. Ensure migrations are run (npx prisma migrate deploy).”) so future misconfigurations are easier to debug.

**Takeaway:** After pointing at a new DB, run migrations before testing auth; surface DB errors as 503 with actionable messages.

---

### 3.6 Documents stuck in “Pending” (no processing)

**Symptom:** Upload succeeded and documents appeared in the UI but status remained “Pending”; processing (chunk → embed → pgvector) never ran.

**Cause:** Document processing is done by a **BullMQ worker** that consumes jobs from **Redis**. If Redis is not configured or not reachable by the backend (e.g. on Railway), jobs are never processed.

**Resolution:**

- **Local:** Start Redis (e.g. `docker run -d -p 6379:6379 redis:7-alpine` or `docker compose up -d`); restart backend.
- **Production (Railway):** Use **Upstash** Redis and configure the backend with a Redis URL (see §3.7).

**Takeaway:** Any queue-based processing (BullMQ, Celery, etc.) requires the queue backend (Redis) to be available and correctly configured in the same environment as the worker.

---

### 3.7 Redis / Upstash: REST vs TCP and TLS

**Symptom:** User had Upstash **REST** URL and token; documents still did not process.

**Cause:** BullMQ uses the **Redis protocol (TCP)**, not the REST API. Upstash provides:
- **REST API** — URL + token (HTTP); not suitable for BullMQ.
- **Redis URL (TCP)** — e.g. `rediss://default:PASSWORD@xxx.upstash.io:6379`; required for BullMQ.

**Resolution:**

- **Backend** was updated to support:
  1. **REDIS_URL** — full TCP URL (e.g. `rediss://default:PASSWORD@xxx.upstash.io:6379`). When set, the app parses host, port, password, and enables TLS for `rediss://`.
  2. **REDIS_HOST**, **REDIS_PORT**, **REDIS_PASSWORD** — with TLS auto-enabled when host is `*.upstash.io` or `REDIS_TLS` is set.
- In Railway, set **REDIS_URL** to the **Redis URL** from Upstash (Redis Connect / Endpoint section), not the REST URL. No need to put the full URL in “Redis password”; it is the connection string.

**Takeaway:** Distinguish REST vs TCP credentials for managed Redis; use the TCP URL (with TLS) for BullMQ and document it clearly.

---

### 3.8 Local dev: “Backend unreachable” after adding runtime config

**Symptom:** After adding runtime config (load `/runtime-config.json` for production), local dev sometimes showed “Backend unreachable”.

**Cause:** In dev, the app was still fetching `/runtime-config.json`; a stale or empty file (e.g. `{"apiUrl":""}`) could override or conflict with `.env`.

**Resolution:**

- In **development** (`import.meta.env.DEV === true`), skip loading runtime config; use only `VITE_API_URL` from `.env`.
- Ensure root `.env` has `VITE_API_URL=http://localhost:3000` for local dev.

**Takeaway:** Use runtime config only where it matters (production); in dev, rely on `.env` and avoid fetching a file that might be stale or empty.

---

## 4. Final Configuration Summary

### 4.1 URLs and origins (production)

| Purpose           | Value (example) |
|-------------------|------------------|
| Frontend (Vercel) | `https://docu-mind-delta.vercel.app` |
| Backend (Railway) | `https://documind-production.up.railway.app` |
| CORS_ORIGIN       | `https://docu-mind-delta.vercel.app` (optional; `*.vercel.app` also allowed in code) |

**Rule:** Frontend and backend URLs must be consistent: **VITE_API_URL** (Vercel) = backend public URL (Railway); **CORS_ORIGIN** (Railway) includes the frontend origin.

### 4.2 Environment variables by environment

**Railway (backend service)**

| Variable        | Example / note |
|-----------------|----------------|
| DATABASE_URL    | Supabase URI with `?sslmode=require` |
| JWT_SECRET      | Long random string |
| CORS_ORIGIN     | `https://docu-mind-delta.vercel.app` |
| REDIS_URL       | `rediss://default:PASSWORD@xxx.upstash.io:6379` (Upstash TCP URL) |
| GEMINI_API_KEY  | Optional; for RAG/chat with Gemini |

**Vercel (frontend project)**

| Variable      | Example / note |
|---------------|----------------|
| VITE_API_URL  | `https://documind-production.up.railway.app` (no trailing slash) |

**Local backend (`backend/.env`)**

- DATABASE_URL — Supabase or `postgresql://user:password@localhost:5432/insight_garden`
- JWT_SECRET
- REDIS_HOST / REDIS_PORT (e.g. localhost, 6379) or REDIS_URL (Upstash)

**Local frontend (root `.env`)**

- VITE_API_URL = `http://localhost:3000`

### 4.3 Code and config changes made

- **Backend**
  - CORS: allow comma-separated **CORS_ORIGIN**; allow `*.vercel.app` and `*.railway.app` in code.
  - Redis: support **REDIS_URL** (parse and use TLS for `rediss://`); support Upstash host/port/password with auto-TLS for `*.upstash.io`.
  - Auth: wrap register/login in try/catch; map Prisma errors to 503 with clear “run migrations” message.
  - Prisma config: load `.env` from `process.cwd()` so `npx prisma migrate deploy` from `backend/` uses `backend/.env`.
- **Frontend**
  - Build: script writes `public/runtime-config.json` from **VITE_API_URL** at build time.
  - Runtime: in production, load backend URL from `/runtime-config.json` first; in dev, skip and use **VITE_API_URL** from `.env`.
  - Register: handle non-JSON error responses (e.g. 502 HTML) without crashing; show status code in error message.
- **Docs**
  - README: production stack (Vercel, Railway, Supabase, Upstash); deployment section; env table updates; Quick Start backend note for Supabase and REDIS_URL.
  - `.env.example` (backend): Supabase and Upstash Redis notes.

---

## 5. Lessons and Takeaways

1. **Env vars are per service** — Required variables must be set on the **service** that runs the process (e.g. Railway backend), with exact names the app expects.
2. **Frontend API URL is build-time for Vite** — Set **VITE_API_URL** in the host’s env (e.g. Vercel) and **redeploy** so the bundle and runtime config use the correct backend URL.
3. **CORS must allow the frontend origin** — Backend must allow the actual frontend origin (or a pattern like `*.vercel.app`); “Failed to fetch” often means CORS.
4. **Managed DB often needs SSL** — Supabase (and similar) require `?sslmode=require` (or equivalent) in the connection string.
5. **Run migrations after DB change** — New DB or new project → run `npx prisma migrate deploy` with the right **DATABASE_URL** before testing auth or app.
6. **Queue = queue backend** — BullMQ (or any job queue) needs Redis (or the chosen backend) configured and reachable; document processing will not run without it.
7. **REST vs TCP for Redis** — Upstash (and similar) offer REST and TCP; use the **TCP URL** (e.g. `rediss://...`) for BullMQ and enable TLS.
8. **One REDIS_URL for simplicity** — Supporting a single **REDIS_URL** (with parsing and TLS) reduces mistakes and matches how Upstash exposes the connection string.
9. **Clear errors for DB/queue** — Returning 503 with “run migrations” or “ensure Redis is configured” speeds up debugging in production.
10. **Docs and .env.example** — Document production stack, deployment steps, and every env var (with examples) so the same URLs and setup can be repeated.

---

## 6. Outcome

- **Frontend** on Vercel loads without “Backend unreachable” and uses the correct backend URL (build-time + runtime config).
- **Backend** on Railway starts reliably with DATABASE_URL, JWT_SECRET, REDIS_URL, and CORS_ORIGIN set.
- **Database** on Supabase is reachable with SSL; migrations applied; auth and documents work.
- **Redis** on Upstash is used by BullMQ; document processing moves documents from Pending → Processing → Done.
- **Same URLs and patterns** — Production mirrors local flow (frontend → backend → DB/Redis) with env-driven URLs and secrets; README and this case study capture the full setup for reuse and onboarding.

---

*Case study generated from the deployment conversation; reflects the actual issues, fixes, and final configuration used for DocuMind (Insight Garden) in production.*
