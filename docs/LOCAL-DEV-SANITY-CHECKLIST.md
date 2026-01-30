# DocuMind – Local dev sanity checklist

Use this to verify frontend–backend integration.

## 1. Environment

- [ ] **Frontend**: Copy repo root `.env.example` to `.env`. Set `VITE_API_URL=http://localhost:3000`. Restart Vite after changing `.env`.
- [ ] **Backend**: Copy `backend/.env.example` to `backend/.env`. Set `DATABASE_URL`, `JWT_SECRET`, and optionally `CORS_ORIGIN=http://localhost:8080` (backend defaults to this if unset).

## 2. Start services

- [ ] **Docker** (from repo root): `docker compose up -d`. Postgres (5432) and Redis (6379) running.
- [ ] **Backend** (from `backend/`): `npm run dev`. Logs show `Application is running on: http://localhost:3000` and `[CORS] Allowed origin: http://localhost:8080`.
- [ ] **Frontend** (from repo root): `npm run dev`. No error about `VITE_API_URL` (fail-fast if unset). App loads on port 8080.

## 3. Connectivity

- [ ] Open frontend at `http://localhost:8080`. No red “Backend unreachable” banner (health check passed).
- [ ] If banner appears, it shows the actual error (e.g. “Failed to fetch”). Fix backend URL or start backend.
- [ ] In browser DevTools → Network: `GET http://localhost:3000/health` returns 200 and `{ "status": "ok" }`.

## 4. Auth (no mocks)

- [ ] **Register**: Create account at `/register`. Expect success and redirect to `/app`, or 409 if email exists.
- [ ] **Login**: Sign in at `/login`. Expect success and redirect to `/app`.
- [ ] **Persistence**: Refresh on `/app`. Brief “Loading…” then app content (Zustand persist rehydration). No “Session expired” immediately after login.

## 5. CORS

- [ ] From `http://localhost:8080`, requests to `http://localhost:3000` succeed (no CORS errors in console).
- [ ] Backend logs on startup: `[CORS] Allowed origin: http://localhost:8080`.

## 6. Errors

- [ ] With backend stopped, submit login/register. Error message shows the actual cause (e.g. “Failed to fetch”), not a generic “Unable to reach server”.
- [ ] With backend running, invalid credentials show server message (e.g. “Invalid email or password”).

---

**Quick one-liner (after env and Docker):**  
Backend: `cd backend && npm run dev` → Frontend: `npm run dev` → Open `http://localhost:8080` → Register/Login.
