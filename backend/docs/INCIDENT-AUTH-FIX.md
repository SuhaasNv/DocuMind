# Auth & Infra Incident: Root Cause and Fixes

This document summarizes the root causes of the auth/infra failures (401 Unauthorized, "Session expired", Internal Server Error on signup, Failed to fetch) and the fixes applied.

---

## 1. Root cause summary

| Symptom | Root cause |
|--------|------------|
| **Unauthorized during chat** | Frontend token was only in Zustand memory; page refresh or new tab had no token, so `Authorization: Bearer <token>` was missing or stale. |
| **Session expired right after login** | Same as above: token not persisted, so any full reload lost it. Backend JWT was valid; frontend had no token after refresh. |
| **Internal Server Error on signup** | Could be DB/Prisma (e.g. wrong `DATABASE_URL` or missing migration). Also possible if `JWT_SECRET` was missing and fallback caused inconsistent signing. |
| **Failed to fetch** | Network/CORS or backend down. If backend failed startup due to missing `JWT_SECRET`/`DATABASE_URL`, frontend got "Failed to fetch". |

**Architecture:** Backend runs on the **host** (e.g. `npm run dev`). Postgres and Redis run in **Docker**. So:

- `DATABASE_URL` must use **host-visible** host/port: `localhost:5432` (not a container name).
- `REDIS_HOST` must be **localhost** (Redis is published on 6379 to the host).

---

## 2. Fixes applied

### Backend

1. **JWT from ConfigService (single source of truth)**  
   - `AuthModule` uses `JwtModule.registerAsync` with `ConfigService.getOrThrow('JWT_SECRET')`.  
   - `JwtStrategy` injects `ConfigService` and uses `configService.getOrThrow('JWT_SECRET')` for `secretOrKey`.  
   - Removed all `process.env.JWT_SECRET || 'change-me-in-production'` fallbacks so missing secret fails fast.

2. **Startup env validation**  
   - In `main.ts`, `validateEnv()` runs before `bootstrap()`.  
   - Required: `JWT_SECRET`, `DATABASE_URL`.  
   - If any are missing, the process exits with a clear message.  
   - Optional warning if `DATABASE_URL` does not contain `5432` (docker-compose default).

### Frontend

3. **Token persistence and rehydration**  
   - Zustand store uses `persist` middleware with key `insight-garden-auth`.  
   - Only auth slice is persisted: `isAuthenticated`, `user`, `accessToken`.  
   - After login/register, token is stored in localStorage and rehydrated on reload, so chat and SSE work after refresh.

### Docs / ops

4. **.env checklist** (see below) and this incident doc.

---

## 3. .env checklist (backend)

Ensure `backend/.env` exists (copy from `backend/.env.example`) and:

| Variable | Required | Notes |
|----------|----------|--------|
| `DATABASE_URL` | Yes | `postgresql://user:password@localhost:5432/insight_garden` — host must be `localhost` when backend runs on host and Postgres in Docker. |
| `JWT_SECRET` | Yes | Long random string; no default. Process exits if missing. |
| `REDIS_HOST` | Yes for BullMQ | `localhost` when Redis runs in Docker with port 6379 published. |
| `REDIS_PORT` | Yes for BullMQ | `6379` |
| `PORT` | No | Default 3000 |
| `CORS_ORIGIN` | No | e.g. `http://localhost:8080` for Vite dev |

**Do not** use container names (e.g. `postgres`, `redis`) as hostnames in `.env` when the backend runs on the host. Use `localhost` and the published ports (5432, 6379).

---

## 4. Sanity checklist (confirm everything works)

- [ ] From repo root: `docker compose up -d` — Postgres and Redis running.
- [ ] `backend/.env` has `JWT_SECRET` and `DATABASE_URL=...@localhost:5432/...`.
- [ ] In `backend`: `npx prisma migrate dev` (if needed), then `npm run dev` — no "[FATAL] Missing required environment variables".
- [ ] Backend logs: "Application is running on http://localhost:3000".
- [ ] Frontend: login → token in localStorage (key `insight-garden-auth`), then reload page — still logged in.
- [ ] Open a document, send a chat message — SSE stream works; no 401.
- [ ] Register a new account — 201, no Internal Server Error.

---

## 5. SSE and JWT

- **Auth method:** Frontend sends `Authorization: Bearer <token>` on the POST request to `/documents/:id/chat/stream`. No query token is required; the guard uses the header.
- **Long streams:** SSE endpoint uses the same JWT for the whole response; token expiry is 7d by default, so normal streams are fine.
- **Token expiry:** If the token expires mid-session, the next request (or next SSE) will get 401; frontend should clear auth and redirect to login (e.g. `onError('Session expired, please log in again')` in the SSE client already handles this).

---

## 6. Optional: route guard after rehydration

Zustand `persist` rehydrates asynchronously. If you add a protected-route guard that redirects to `/login` when `!isAuthenticated`, consider waiting for rehydration (e.g. `useAppStore.persist.getStorage()` or a small "rehydrated" flag) so users with a valid stored token don’t get redirected to login on first paint.
