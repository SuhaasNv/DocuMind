# DocuMind / Insight Garden – Technical Audit

**Date:** 2025-01-31  
**Scope:** Full technical audit of existing codebase (frontend, backend, infrastructure). No new features added.  
**Mindset:** “If this app were handed to me as the new owner, what would I fix before I trust it in production?”

---

## A. Executive Summary

### Overall maturity score: **5.5 / 10**

| Dimension              | Score | Notes |
|------------------------|-------|--------|
| Architecture & boundaries | 6/10 | Clear separation in places; WebSocket unused; some leaky concerns |
| Auth & security        | 5/10 | Backend auth solid; **no frontend route protection**; token in localStorage |
| Data flow correctness  | 6/10 | Upload→process→retrieve→chat works; **file not deleted on document delete** |
| Streaming & performance| 7/10 | SSE lifecycle and abort handled; throttled updates; retrieval has fallback |
| State management       | 6/10 | Hydration gate present; **single monolithic store**; poll timers never cleared |
| UX & product quality   | 5/10 | Empty/loading states exist; **Retry dead**; delete optimistic without feedback |
| Developer experience   | 6/10 | Docs and checklists help; **two .env roots**; CORS/port consistency in docs |

### Verdict

- **MVP?** Yes. Core RAG flow (upload PDF → chunk → embed → retrieve → chat with streaming) works.
- **Portfolio-ready?** Yes, with caveats: fix route protection and document delete behavior before showing as “production-grade.”
- **Production-ready?** No. Must address: no protected routes, file orphan on delete, optional but important: retrieval raw SQL safety, JWT secret validation vs .env.example, and clarity on WebSocket vs polling.

---

## 1. Architecture & Boundaries

### What is GOOD

- **Clear backend layering:** Auth, documents, retrieval, RAG orchestrator, jobs, embedding, chunks are in separate modules. Documents controller delegates to services; ownership (`userId`) is enforced in DocumentsService, RetrievalService, and job processor.
- **RAG pipeline is modular:** Chunking → embedding → DocumentChunkService (pgvector) → RetrievalService → PromptService → LlmService. You can swap LLM/embedding providers via env.
- **Transport-agnostic streaming:** `RagOrchestratorService.streamAnswer()` yields delta/done events; controller maps them to SSE. No HTTP details in orchestrator.
- **Public vs protected API:** `@Public()` on auth and health; `JwtAuthGuard` applied globally with reflector for public routes.
- **Single CORS origin, ValidationPipe, global exception filter:** Consistent API behavior and error shape.

### What is RISKY

- **WebSocket gateway is unused by frontend.** Backend has `EventsGateway` (Socket.IO) emitting `document.created`, `document.updated`, `document.deleted` to the document owner. The frontend never connects; it uses **polling** in `UploadArea` (`pollDocumentStatus` every 2s). So you have two update paths (WebSocket + poll), one of which is dead. At scale, many clients polling is worse than one WebSocket per client; the design is inconsistent.
- **Monolithic Zustand store:** Auth, documents, conversations, UI (sidebar, upload, search, abort SSE) live in one persisted store. It works but will become hard to reason about and test as features grow (e.g. multiple workspaces, sharing).
- **RAG and retrieval both know about “document ready”:** Controller and RetrievalService both check `DocumentStatus.DONE`. Not wrong, but the rule is duplicated; a single “can use document for RAG” gate (e.g. in a guard or service) would reduce drift.

### What is BROKEN or FRAGILE

- **Document delete does not remove file from disk.** `DocumentsService.remove()` only deletes the DB row (and cascade removes chunks). The PDF at `uploads/${id}.pdf` is never deleted. Over time this leaks disk and can confuse re-use of IDs or backups.
- **Retrieval uses `$queryRawUnsafe` with string-built vector.** `embeddingStr = \`[\${queryEmbedding.join(',')}]\`` and `documentId`/`k` are passed as parameters. `documentId` is from route (validated by `findOne`); `k` is from validated DTO. The real risk is low today (embedding is numeric array from your code), but any future use of user-controlled input in that SQL path would be unsafe. Prefer parameterized APIs or a dedicated pgvector client.

### What should be FIXED (priority)

1. **P0:** Add file deletion on document delete (e.g. `unlink(absolutePath)` in `DocumentsService.remove()` after DB delete, with try/catch and log).
2. **P1:** Either wire the frontend to WebSocket for document status updates (and remove or reduce polling) or remove the WebSocket gateway and document events to avoid dead code and confusion.
3. **P2:** Consider splitting Zustand into auth store vs documents/chat store (or at least document the boundaries). Optional: centralize “document ready for RAG” in one place.

---

## 2. Auth & Security

### What is GOOD

- **JWT lifecycle:** Issued on login/register; validated in `JwtStrategy` with `AuthService.validateUser`; expiry respected (`ignoreExpiration: false`). No refresh token (simplifies; acceptable for MVP).
- **Guards and decorators:** Global `JwtAuthGuard`; `@Public()` for auth and health; `CurrentUser` for `user.sub`; no auth bypass found on document/chat/retrieval routes.
- **Backend ownership everywhere:** `findOne(id, user.sub)`, `findAllByUser(user.sub)`, retrieval and RAG by `userId`/`documentId` with document ownership checked. Job processor skips if document not found or not owned.
- **SSE auth:** Same guard and `CurrentUser` on `POST /documents/:id/chat/stream`; token from header (and optional `query.token` for proxies). Abort on `req.on('close')` so disconnect is handled.
- **Password:** bcrypt with 10 rounds; not logged or returned. Register/Login DTOs validated (email, min length, etc.).
- **Startup check:** Auth module rejects missing or literal `'change-me-in-production'` JWT secret so misconfiguration fails fast.

### What is RISKY

- **Token in localStorage only.** Persisted in Zustand with `partialize` for `isAuthenticated`, `user`, `accessToken`. XSS can steal the token. For a portfolio/demo this is common; for real production you’d want httpOnly cookies or short-lived tokens + refresh.
- **`.env.example` JWT value:** Example uses `JWT_SECRET="change-me-in-production-use-long-random-string"`. The code only rejects the exact string `'change-me-in-production'`, so copying the example as-is still starts the app. New devs might ship with a weak secret. Consider rejecting any secret containing `change-me` or aligning example to a value that fails the check.
- **No rate limiting.** Login/register and chat/stream are not rate-limited. Acceptable for MVP; for production you’d add rate limits and possibly CAPTCHA on auth.

### What is BROKEN or FRAGILE

- **No frontend route protection.** Routes `/app`, `/app/settings`, and `/chat/:documentId` are not protected. Any user can open `/app` or `/chat/xyz` without logging in. The app shows the layout (sidebar, dashboard or chat UI); API calls then 401. So:
  - UX: user sees app shell and then “Session expired” or failed requests.
  - Security: app structure and navigation are visible; only the API enforces auth. For a hiring panel this looks like “auth was not finished.”
- **SettingsPage** redirects to `/` when not authenticated (after hydration), but Dashboard and ChatPage do not. So unauthenticated users can stay on `/app` or `/chat/:id` and only see failures when they act.

### What should be FIXED (priority)

1. **P0:** Add a protected-route layer: when `!isAuthenticated` (after hydration), redirect to `/login` (or `/`) for `/app`, `/app/*`, and `/chat/:documentId`. Use a wrapper component or route element that reads from the auth store and renders `<Navigate to="/login" replace />` when not authenticated.
2. **P1:** Align JWT secret validation with `.env.example` (reject placeholder-like values or set example to a value that fails the current check).
3. **P2:** Document the “token in localStorage” tradeoff and, if aiming for production, plan for httpOnly cookies or short-lived access tokens.

---

## 3. Data Flow Correctness

### What is GOOD

- **Upload → process → retrieve → chat:** Upload creates document (PENDING), writes file, enqueues job. Processor reads file, chunks, embeds, writes chunks, updates status to DONE (or FAILED). Retrieval and chat require DONE and ownership. Flow is consistent.
- **Status transitions:** PENDING → PROCESSING → DONE or FAILED. Progress 0 → 30 (chunking) → 30–90 (embedding) → 100. Frontend shows progress and status; chat/retrieval blocked until DONE.
- **Error propagation:** Backend uses HTTP exceptions and `HttpExceptionFilter`; frontend shows server message or `getApiErrorMessage`. Login/register/upload/chat surface errors to the user.
- **Conversation keyed by documentId:** Store uses `documentId` as key for conversations; no cross-document leakage.

### What is RISKY

- **Dashboard documents load once on mount.** `useEffect` with `[accessToken, setDocuments]` fetches `/documents` and replaces full list. If the user deletes a doc in another tab or another client, this tab doesn’t know until refresh or next visit. Acceptable for MVP; for multi-tab you’d want WebSocket or refetch on focus.
- **Delete document: optimistic UI without server confirmation.** `DocumentCard` calls DELETE then immediately `removeDocument(document.id)`. If the request fails (network, 403, 500), the doc still disappears from the UI. User has no feedback that delete failed.

### What is BROKEN or FRAGILE

- **File not deleted on document delete** (see Architecture). Data flow is “delete from DB” only; disk state is wrong.
- **Failed document: “Retry” does nothing.** DocumentCard shows a “Retry” button for FAILED docs but there is no `onClick` handler. Dead UI.

### What should be FIXED (priority)

1. **P0:** Delete file on document remove (see Architecture). Optionally: only remove from UI after successful DELETE response, or show toast on failure and revert.
2. **P1:** Either implement Retry (e.g. re-add job for same document or re-upload flow) or remove the Retry button and show “Processing failed” with a short explanation.
3. **P2:** Consider refetching documents on window focus or when navigating back to dashboard so multi-tab stays in sync.

---

## 4. Streaming & Performance

### What is GOOD

- **SSE lifecycle:** Backend sets SSE headers, uses `req.on('close')` to abort, and breaks the loop on `res.writableEnded` or `ac.signal.aborted`. Always calls `res.end()` in `finally`. Frontend passes `AbortSignal` and checks it in callbacks; `reader.releaseLock()` in `finally`.
- **Abort on unmount/navigate:** ChatPage sets `setAbortActiveSSE` and cleans up on unmount (abort, clear streaming state). Prevents updates after navigate.
- **Throttled updates:** ChatPage throttles `updateMessage` (e.g. 40ms) so React doesn’t re-render on every token. Good for TTFT and smoothness.
- **RAG orchestrator always yields `done`:** So the frontend can always exit streaming state (e.g. stop blinking cursor) even on error or abort.
- **Retrieval:** Parallel document lookup and query embedding; score-drop early stop; fallback to order-by chunk_index when similarity returns no rows. pgvector usage is appropriate for the schema.

### What is RISKY

- **TTFT:** Depends on embedding + retrieval + prompt build + first LLM token. No dedicated metrics or logging in the frontend; backend has `logRagLatency`. For production you’d want a simple TTFT metric and possibly timeouts.
- **No request timeout on SSE.** If the backend hangs after sending headers, the client waits until abort or tab close. Consider a timeout (e.g. 60–120s) that aborts the request.

### What is BROKEN or FRAGILE

- Nothing critical. Stream error path writes `event: error` and frontend `onError` runs; if stream ends without `done` (e.g. crash), frontend might leave a message in streaming state. The backend’s `finally` that always yields `done` mitigates this.

### What should be FIXED (priority)

1. **P2:** Add a client-side timeout for the SSE request (e.g. 90s) that triggers abort and onError.
2. **P2:** Optionally surface TTFT or “time to answer” in UI (e.g. dev mode or settings) for tuning.

---

## 5. State Management (Frontend)

### What is GOOD

- **Hydration gate:** AppLayout (and SettingsPage) wait for `useAppStore.persist.hasHydrated()` (with 3s fallback) before rendering app content. Prevents 401s from requests running before `accessToken` is restored from localStorage.
- **Single source of truth for API base URL:** `getApiBaseUrl()` / `getApiBaseUrlOrThrow()` in `api.ts`; all fetch and SSE use it.
- **Preferences in separate store:** `usePreferencesStore` with persist; Settings and chat components read from it. Clear split from auth/documents/chat.
- **Conversations keyed by documentId:** Predictable shape; addMessage/updateMessage/setStreaming/setMessageSources are consistent.

### What is RISKY

- **Everything else in one store:** Auth, documents, conversations, sidebar, upload, search, abort callback. Persist only partializes auth; documents and conversations are in memory until refetched. After refresh, dashboard refetches documents and `setDocuments` rebuilds conversation placeholders. If someone ever persisted documents/conversations, hydration could overwrite server state; currently it doesn’t, but the big store makes such mistakes easier.
- **Stale token after logout in another tab.** Logout only clears local state in this tab. Other tabs still have the old token until they hit an API and get 401. No broadcast channel or storage event to force logout elsewhere. Minor for MVP.

### What is BROKEN or FRAGILE

- **Poll timers never cleared.** In UploadArea, `pollRef.current[docId]` is set with `setInterval` and cleared when status is DONE/FAILED, but there is no cleanup on unmount. If the user uploads and then navigates away, the interval keeps running until the doc finishes. Small leak and unnecessary work.
- **Zustand partialize typo in docs:** Persist `partialize` includes `isAuthenticated`, `user`, `accessToken` and explicitly excludes `abortActiveSSE`. Comment says “do not persist abortActiveSSE” but the key in partialize is not `abortActiveSSE` (it’s omitted by not being in the list). No bug, but the comment could be clearer.

### What should be FIXED (priority)

1. **P1:** In UploadArea, clear all intervals in a `useEffect` cleanup (e.g. on unmount, iterate `pollRef.current` and clearInterval).
2. **P2:** Consider splitting stores (auth vs app/documents/chat) and document what is persisted and what is refetched.
3. **P2:** Optional: on 401 from any API, clear auth and redirect to login so all tabs eventually converge.

---

## 6. UX & Product Quality

### What is GOOD

- **Empty states:** Dashboard “No documents yet” / “No documents match your search”; ChatPage “Document not found” with back button; EmptyChat with suggested prompts. Clear and actionable.
- **Loading states:** AppLayout “Loading…” until hydration; Settings skeleton while !hydrated; ChatPage streaming indicator and disabled input while streaming. UploadArea disables during upload.
- **Error messages:** Backend errors (e.g. “Invalid email or password”, “Document is not ready for chat”) surface to the user. `getApiErrorMessage` uses real network errors where possible. Backend health banner shows actual error when backend is unreachable.
- **Settings:** Account (read-only), Security (logout; change password disabled with tooltip), Application preferences (auto-scroll, show sources, animations), System info (backend URL, version, env). Not placeholders except “Change password” and “Continue with Google”.
- **Chat:** Markdown rendering, sources (chunk indices), throttled streaming, abort on unmount. Good baseline.

### What is RISKY

- **Forgot password / Terms / Privacy:** Links go to `#`. Dead links.
- **“Continue with Google”:** Button present but no handler. Users may expect it to work.
- **Delete document:** No confirmation dialog. One misclick and the doc is gone (and file still on server until you fix delete).

### What is BROKEN or FRAGILE

- **Retry on FAILED document:** Button is visible but has no handler. Pure dead end.
- **Document delete:** Optimistic remove from UI even when DELETE fails; user is not told.

### What should be FIXED (priority)

1. **P0:** Implement Retry for FAILED documents (re-enqueue job or clear status and re-run) or remove the button and replace with “Processing failed” text + optional support link.
2. **P1:** Confirm before delete (e.g. AlertDialog “Delete this document? This cannot be undone.”).
3. **P1:** Only remove document from UI after successful DELETE, or show toast on failure and revert list.
4. **P2:** Either remove “Forgot password”, “Terms”, “Privacy”, “Continue with Google” or implement them; avoid leaving broken links/buttons in a portfolio build.

---

## 7. Developer Experience

### What is GOOD

- **README and docs:** Backend README, `LOCAL-DEV-SANITY-CHECKLIST.md`, `INCIDENT-AUTH-SSE-FIX.md` (and backend incident doc). Clear “run from backend/”, Docker for Postgres/Redis only, CORS and env explained.
- **Env examples:** Root `.env.example` (VITE_API_URL); backend `.env.example` (DATABASE_URL, JWT_SECRET, Redis, CORS, embedding, LLM). New devs can copy and run.
- **Fail-fast:** Backend exits if required env is missing; frontend shows banner if backend unreachable or VITE_API_URL unset. Auth module rejects bad JWT secret.
- **Validation:** class-validator on DTOs; ValidationPipe with whitelist and forbidNonWhitelisted. Reduces bad input.
- **Single repo, clear layout:** Frontend at root (Vite/React), backend in `backend/`, docs in `docs/`. Easy to navigate.

### What is RISKY

- **Two .env roots:** Frontend at repo root (`.env` with VITE_*), backend in `backend/.env`. Both must be set. Checklist covers it but new devs often miss one.
- **Port/CORS:** Vite is 8080; backend default CORS is 8080. INCIDENT doc says 5173 in places; LOCAL-DEV-SANITY-CHECKLIST says 8080. Inconsistency can confuse; code is 8080.
- **Backend must be run from `backend/`** so `process.cwd()` is correct for `.env` and `uploads/`. Documented but easy to forget when running from root.

### What is BROKEN or FRAGILE

- **Preferences store key:** `documind-preferences` (typo vs “DocuMind”). Cosmetic; no functional bug.
- **No script to run backend from root** that `cd`s into backend (e.g. `npm run dev:api` from root). Would reduce “wrong cwd” mistakes.

### What should be FIXED (priority)

1. **P1:** Unify port/CORS in all docs (e.g. “Frontend 8080, backend 3000, CORS_ORIGIN=http://localhost:8080”) and fix INCIDENT doc to 8080.
2. **P2:** Add root-level script `dev:backend` that runs `cd backend && npm run dev` so “run from backend/” is optional.
3. **P2:** In root README, add a one-line “Prerequisites: Docker, Node; then: copy .env and backend/.env, docker compose up -d, npm run dev:backend, npm run dev” so onboarding is copy-paste.

---

## B. Critical Issues (P0 / P1 / P2)

### P0 – Must fix before any new feature

| # | Issue | Where | Action |
|---|--------|------|--------|
| 1 | No frontend route protection | App routing | Add protected route wrapper: redirect to `/login` when !isAuthenticated for `/app`, `/app/*`, `/chat/:documentId` (after hydration). |
| 2 | Document delete does not remove PDF from disk | `DocumentsService.remove()` | After DB delete, `unlink(absolutePath)` for `document.filePath` (with try/catch and log). |
| 3 | Retry button for FAILED document does nothing | DocumentCard | Implement Retry (re-enqueue job or equivalent) or remove button and show “Processing failed” only. |

### P1 – Should fix soon

| # | Issue | Where | Action |
|---|--------|------|--------|
| 4 | JWT secret placeholder | auth.module.ts, .env.example | Reject more placeholder values or set .env.example to a value that fails the current check. |
| 5 | WebSocket gateway unused | Backend EventsGateway, frontend | Either wire frontend to WebSocket for document status and reduce/remove polling, or remove WebSocket and document events. |
| 6 | Poll intervals never cleared on unmount | UploadArea | Clear all intervals in useEffect cleanup. |
| 7 | Delete document optimistic without feedback | DocumentCard, Dashboard | Confirm before delete; only remove from UI on success, or show toast on failure. |
| 8 | CORS/port docs inconsistency | INCIDENT doc, LOCAL-DEV | Use 8080 everywhere and fix INCIDENT-AUTH-SSE-FIX.md. |

### P2 – Nice to have

| # | Issue | Where | Action |
|---|--------|------|--------|
| 9 | Retrieval raw SQL | retrieval.service.ts | Prefer parameterized pgvector API or dedicated client instead of $queryRawUnsafe with string-built vector. |
| 10 | Monolithic store | useAppStore | Split or document boundaries (auth vs documents/chat); optional refetch on focus. |
| 11 | SSE timeout | Frontend streamChat | Add client-side timeout (e.g. 90s) that aborts and calls onError. |
| 12 | Dead links/buttons | Login, Register | Remove or implement Forgot password, Terms, Privacy, Continue with Google. |
| 13 | Root script for backend | package.json | Add `dev:backend` that runs backend from root. |
| 14 | Preferences storage key typo | usePreferencesStore | Rename to `documind-preferences` or `insight-garden-preferences` for consistency. |

---

## C. Architectural Risks (Long-term)

### What will break or hurt at ~10× usage

- **Polling:** Every client with an in-progress document polls every 2s. 10× users → 10× GET /documents/:id. Use WebSocket for status or at least increase interval and add backoff.
- **Single backend, no horizontal scaling:** One Node process; no shared session or job state across instances. To scale, you’d need stateless API, shared Redis for BullMQ (already there), and no in-process state (e.g. in-memory rate limits).
- **Uploads on local disk:** `uploads/` on one server. At scale you’d need object storage (S3/GCS) and possibly signed URLs; document processor would pull from there.
- **No DB connection pooling config:** Prisma default pool may be fine for small load; under concurrency you may need to tune pool size and timeouts.

### What will hurt velocity in 3 months

- **One big Zustand store:** Harder to test and reason about; any new feature touches the same blob. Split by domain (auth, documents, chat, UI) or at least document clear boundaries.
- **WebSocket vs polling ambiguity:** If the team forgets the frontend doesn’t use WebSocket, they may add more events on the backend and wonder why the UI doesn’t update. Either adopt WebSocket or remove it.
- **Two .env roots and “run from backend/”:** New contributors will keep missing one env or wrong cwd. Automate (scripts, single docker-compose that runs backend with correct cwd) or document very prominently.

---

## D. Clear Next Steps

### Sequenced plan (what to fix first, second, third)

1. **First (before any new feature)**  
   - Add **protected routes** for `/app`, `/app/*`, `/chat/:documentId`: after hydration, if !isAuthenticated → `<Navigate to="/login" replace />`.  
   - In **DocumentsService.remove()**, after deleting the document row, delete the file at `uploads/${id}.pdf` (or from `document.filePath`); guard for null `filePath`, try/catch, log.  
   - **Retry:** Either implement re-enqueue (or re-process) for FAILED documents in backend and call it from DocumentCard “Retry”, or remove the Retry button and show only “Processing failed” text.

2. **Second**  
   - **UploadArea:** Clear all poll intervals in a useEffect cleanup.  
   - **Document delete:** Add confirmation dialog; only remove from UI on successful DELETE (or show error toast and revert).  
   - **WebSocket:** Decide: wire frontend to Socket.IO for document events and reduce/remove polling, or remove EventsGateway and related events.  
   - **Docs:** Align CORS/port (8080) in INCIDENT and any other docs.

3. **Third**  
   - JWT secret validation vs .env.example.  
   - Optional: retrieval SQL safety (parameterized pgvector).  
   - Optional: SSE client timeout, store split, root `dev:backend` script, fix dead links/buttons.

### What NOT to build yet

- Do **not** add new product features (e.g. new RAG modes, sharing, billing) until P0 and at least the first half of P1 are done.  
- Do **not** add more backend features that depend on WebSocket until the “use it or remove it” decision is made.  
- Do **not** persist documents or full conversations to localStorage until you have a clear sync strategy (e.g. server as source of truth, refetch on load).

---

## Summary table (by dimension)

| Dimension        | Good | Risky | Broken/Fragile |
|-----------------|------|-------|----------------|
| Architecture    | Layering, RAG modular, transport-agnostic stream | WebSocket unused, big store | File not deleted on delete, raw SQL in retrieval |
| Auth & security | JWT, guards, ownership, SSE auth, startup check | Token in localStorage, .env.example secret | **No protected routes** |
| Data flow       | Upload→process→retrieve→chat, status, errors | Optimistic delete, one-time fetch | File orphan, **Retry dead** |
| Streaming       | SSE lifecycle, abort, throttle, done event | TTFT not surfaced, no client timeout | — |
| State           | Hydration gate, API URL central, preferences store | Monolithic store, stale token other tab | **Poll timers not cleared** |
| UX              | Empty/loading/error states, settings useful | Forgot password / Google / Terms dead links | **Retry dead**, delete optimistic |
| DX              | Checklists, env examples, fail-fast | Two .env roots, port/CORS in docs | Preferences key typo, no root backend script |

---

*End of audit.*
