# Incident: Auth + SSE + Infra Fix (Post-Mortem & Fix Plan)

## 1. Backend runtime reality

- **Where the backend runs**: On the **host** (not in Docker). You start it with `cd backend && npm run dev`. Only Postgres and Redis run in Docker (`docker compose up -d`).
- **JWT secret**: Loaded via `ConfigModule.forRoot({ isGlobal: true })` from `backend/.env` when the app starts. **Critical**: You must run the backend from the `backend/` directory so `process.cwd()` is `backend/` and `.env` is found. If you run from repo root without a `.env` in root, `JWT_SECRET` may be missing and the app now **fails fast** at startup if `JWT_SECRET` is unset or still the default.
- **Prisma**: Uses `DATABASE_URL` from env. With Docker exposing `5432`, `DATABASE_URL="postgresql://user:password@localhost:5432/insight_garden"` is correct (host → localhost:5432 → container).
- **Redis**: Uses `REDIS_HOST` and `REDIS_PORT` from env. With Docker exposing `6379`, `REDIS_HOST=localhost` and `REDIS_PORT=6379` are correct (host → localhost:6379 → container).

**No in-container networking**: Backend talks to Postgres and Redis via **localhost** and published ports. No `postgres` or `redis` hostnames.

---

## 2. Root-cause explanation (not guesses)

### Unauthorized during chat / “Session expired, please log in again”

1. **Primary cause**: **Token not available when the request is made.**  
   - Auth state (including `accessToken`) is stored in Zustand with `persist` (localStorage).  
   - Rehydration from localStorage is **async**. On first render after a refresh or new tab, the store can still have default state (`accessToken: null`) until rehydration finishes.  
   - If the user sends a chat message (or any request) before rehydration completes, the frontend sends no token (or a stale one), and the backend returns **401** → frontend shows “Session expired, please log in again”.
2. **Secondary**: If the backend was started without a valid `.env` (e.g. wrong cwd), `JWT_SECRET` could be wrong or default; verification would then fail for any token. The app now fails at startup if `JWT_SECRET` is missing or default.

### Internal Server Error on signup

- **Cause**: Unhandled exceptions in `AuthService.register()`.  
  - Possible cases: (1) **DB connection failure** (Postgres down or wrong `DATABASE_URL`) → Prisma throws; (2) **Unique constraint violation** (e.g. race: two signups with same email) → `PrismaClientKnownRequestError` P2002; (3) Other Prisma errors.  
  - None of these were mapped to HTTP exceptions, so the global filter returned **500 Internal Server Error**.  
- **Fix**: Register now catches `PrismaClientKnownRequestError` (P2002) → **409 Conflict** (“Email already registered”), and `PrismaClientInitializationError` → **503 Service Unavailable** with a clear message. Other errors are still rethrown (and may 500 until further handling is added).

### Failed to fetch (frontend)

- **Cause**: Network or CORS.  
  - Backend not running, wrong `VITE_API_URL`, or CORS misconfiguration.  
  - With `credentials: true` and custom headers, the browser requires a matching `Access-Control-Allow-Origin` (not `*`). If `CORS_ORIGIN` was not set, or frontend origin didn’t match, preflight or credentialed requests could fail and surface as “Failed to fetch”.  
- **Fix**: Set `CORS_ORIGIN=http://localhost:5173` in backend `.env` (and `.env.example`) so the dev server origin is explicitly allowed.

### SSE stream failing intermittently

- **Cause**: Same as “Unauthorized during chat”: token missing or invalid when the **initial** request is made (e.g. before rehydration, or after refresh).  
  - SSE does **not** resend headers after the connection is open; auth is evaluated once when `POST /documents/:id/chat/stream` is called. If the token is missing or invalid at that moment, the guard returns 401 and the stream never starts.  
- **Fix**: Rehydration gate in the app layout so authenticated requests (including SSE) only run after the persisted store has rehydrated. Optional **query fallback** `?token=...` was added for environments that strip `Authorization` headers (e.g. some proxies).

---

## 3. Architecture (backend not containerized)

- **Backend**: Runs on host; reads `backend/.env`; connects to Postgres and Redis on **localhost** with Docker-published ports.
- **Correct env**:
  - `DATABASE_URL="postgresql://user:password@localhost:5432/insight_garden"`
  - `REDIS_HOST=localhost`
  - `REDIS_PORT=6379`
  - `JWT_SECRET=<long random string>`
  - `CORS_ORIGIN=http://localhost:5173`
- No changes needed to Docker networking; only ensure the backend is started from `backend/` and the above values are set.

---

## 4. SSE-specific behavior and auth

- **JWT**: The SSE endpoint uses the same `JwtAuthGuard` as other document routes. The token is checked **once** when the request hits the server (before the stream starts).
- **Long streams**: No mid-stream re-check of the token; the connection is already authenticated. Token expiry during a long stream does not kill the stream; only the next new request would get 401.
- **How to pass auth for SSE**:
  - **Preferred**: `Authorization: Bearer <token>` in the request headers (current frontend uses this with `fetch()`).
  - **Fallback**: Query parameter `?token=<token>` for environments that strip headers (e.g. some proxies). Backend now accepts either; prefer header for normal use.

---

## 5. Step-by-step fix plan (applied)

1. **Backend**
   - Use **ConfigService** for JWT in `AuthModule` and **JwtStrategy**; fail startup if `JWT_SECRET` is missing or default.
   - Support **JWT_EXPIRES_IN** from env (default 604800 = 7 days).
   - In **AuthService.register()**: catch **PrismaClientKnownRequestError** (P2002) → **ConflictException**; **PrismaClientInitializationError** → **ServiceUnavailableException** with a clear message.
   - **JwtStrategy**: accept token from **header first**, then from **query.token** (for SSE/proxies).
   - **.env / .env.example**: Document `DATABASE_URL`, `REDIS_*`, `JWT_SECRET`, `JWT_EXPIRES_IN`, and set **CORS_ORIGIN=http://localhost:5173**.

2. **Frontend**
   - **Rehydration gate**: In **AppLayout**, wait for `useAppStore.persist.hasHydrated()` / `onFinishHydration` before rendering app content. Show a short “Loading…” until then so no authenticated request (including SSE) runs with an empty store.
   - Auth is already persisted (Zustand `persist` with `partialize` for `isAuthenticated`, `user`, `accessToken`); no change to persistence logic, only to **when** the app uses that state.

3. **SSE**
   - No change to how the stream works; auth is evaluated once at request start.
   - Optional **query.token** support added so SSE works even if a proxy strips `Authorization`.

---

## 6. Exact code changes summary

| Area | File | Change |
|------|------|--------|
| Backend | `auth/auth.module.ts` | JWT from ConfigService; reject default `JWT_SECRET`; support `JWT_EXPIRES_IN`. |
| Backend | `auth/jwt.strategy.ts` | Use ConfigService for secret; extract JWT from header then `query.token`. |
| Backend | `auth/auth.service.ts` | In `register()`, catch Prisma P2002 → Conflict; PrismaClientInitializationError → 503. |
| Backend | `.env` | Add `CORS_ORIGIN=http://localhost:5173`. |
| Backend | `.env.example` | Document JWT, CORS, DB, Redis; note “run from backend/”. |
| Frontend | `AppLayout.tsx` | Rehydration gate: wait for `persist.hasHydrated()` / `onFinishHydration` before rendering `<Outlet />`. |

---

## 7. Exact .env corrections (backend)

Ensure `backend/.env` contains at least:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/insight_garden"
JWT_SECRET="<your-long-random-string>"   # e.g. openssl rand -base64 32
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

- Do **not** use `JWT_SECRET="change-me-in-production-use-long-random-string"` in production; the app will still start but you should replace it with a strong secret.
- Optional: `JWT_EXPIRES_IN=604800` (7 days in seconds).

---

## 8. Sanity checklist (confirm everything is fixed)

- [ ] **Docker**: From repo root, `docker compose up -d`. Postgres and Redis are running; `docker compose ps` shows both healthy.
- [ ] **Backend**: From **backend/** directory, `npm run dev`. Console shows “Application is running on: http://localhost:3000” and no “JWT_SECRET must be set” (or similar) error.
- [ ] **Env**: `backend/.env` has `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGIN=http://localhost:5173`. No typo in `DATABASE_URL` (e.g. port 5432).
- [ ] **Migrations**: From `backend/`, `npx prisma migrate deploy` (or `migrate dev` if applicable). No migration errors.
- [ ] **Register**: Open frontend, go to Register, create a new account. Expect **201** and redirect to app, or **409** if email exists; no **500**.
- [ ] **Login**: Log in with that account. Expect **200** and redirect; token and user in Zustand; localStorage has `insight-garden-auth` with `state.accessToken` and `state.user`.
- [ ] **Refresh**: While on `/app` or `/chat/:id`, refresh the page. Brief “Loading…” then app content; no immediate “Session expired” or 401.
- [ ] **Chat/SSE**: Open a document chat and send a message. SSE request must include `Authorization: Bearer <token>` (check Network tab). Stream should return events (e.g. `event: delta`, `event: done`); no 401.
- [ ] **CORS**: From browser at `http://localhost:5173`, all API requests to `http://localhost:3000` succeed without “Failed to fetch” due to CORS (check Console and Network).
- [ ] **Optional**: If you use a proxy that strips headers, try SSE with `?token=<accessToken>` and confirm the stream still starts.

---

## 9. If problems persist

- **401 on every request**: Confirm backend was restarted after changing `JWT_SECRET` (tokens signed with the old secret will fail). Log out and log in again to get a new token.
- **500 on register**: Check backend logs for the actual exception. If it’s “Can’t reach database server”, ensure Postgres is up and `DATABASE_URL` is correct (host, port, user, password, db name).
- **“Failed to fetch”**: Ensure backend is listening on the port in `VITE_API_URL` (default `http://localhost:3000`), and `CORS_ORIGIN` matches the frontend origin (e.g. `http://localhost:5173` for Vite dev).
