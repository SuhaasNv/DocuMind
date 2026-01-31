# Contributing to DocuMind (Insight Garden)

Thank you for your interest in contributing. This document explains how to set up your environment, follow our conventions, and submit changes.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Branching & Commits](#branching--commits)
- [Pull Request Process](#pull-request-process)
- [Code Style](#code-style)
- [Testing](#testing)
- [Scope & Priorities](#scope--priorities)

---

## Code of Conduct

- Be respectful and inclusive. We aim for a welcoming environment for everyone.
- Give constructive, factual feedback. Focus on code and behavior, not people.
- If you see something that violates this, report it via an issue or privately to maintainers.

---

## Getting Started

1. **Fork** the repository on GitHub and clone your fork locally.
2. Add the upstream remote (optional, for syncing):
   ```bash
   git remote add upstream https://github.com/ORIGINAL_ORG/insight-garden.git
   ```
3. Ensure you have **Node.js 18+**, **npm**, and **Docker** (for Postgres + Redis). See [README.md](README.md#prerequisites) and [Quick Start](README.md#quick-start).

---

## Development Setup

1. From repo root: `npm install`.
2. Start infrastructure: `docker compose up -d`.
3. Backend:
   ```bash
   cd backend
   cp .env.example .env
   # Set JWT_SECRET, DATABASE_URL, REDIS_HOST, REDIS_PORT, CORS_ORIGIN
   npx prisma migrate deploy
   npm run dev
   ```
4. Frontend (new terminal, from repo root):
   ```bash
   cp .env.example .env
   # Set VITE_API_URL=http://localhost:3000
   npm run dev
   ```
5. Open http://localhost:8080 and run through [docs/LOCAL-DEV-SANITY-CHECKLIST.md](docs/LOCAL-DEV-SANITY-CHECKLIST.md) to verify.

---

## Branching & Commits

### Branch naming

- `feature/<short-name>` — New features (e.g. `feature/protected-routes`).
- `fix/<short-name>` — Bug fixes (e.g. `fix/delete-file-on-remove`).
- `docs/<short-name>` — Documentation only.
- `chore/<short-name>` — Tooling, dependencies, config.

Branch from `main` and keep branches short-lived.

### Commit messages

- Use present tense, imperative mood: “Add protected routes” not “Added protected routes”.
- First line: concise summary (≤72 chars). Optionally add a body after a blank line.
- Reference issues when relevant: “Fix document delete (fixes #12).”

---

## Pull Request Process

1. **Open a PR** against `main` from your fork/branch.
2. **Title and description:** Clear title; description should explain what changed and why. Link any related issues.
3. **Checks:** Ensure `npm run lint` and `npm run test` pass (root and `backend/` as applicable). If you changed the schema, run `npx prisma migrate dev` and include the migration.
4. **Review:** Address maintainer feedback. We may request changes or merge once approved.
5. **Merge:** Maintainers merge (squash or merge commit per project preference). Delete the branch after merge.

---

## Code Style

### Frontend

- **TypeScript:** Strict mode; avoid `any` unless justified.
- **React:** Functional components and hooks; keep components focused.
- **State:** Use Zustand as in existing code; auth/prefs persist, documents/chat refetched.
- **Paths:** Use the `@/` alias for `src/` (e.g. `@/components/app/Header`).
- **Formatting:** Use the project’s ESLint and Prettier config; run `npm run lint` before pushing.

### Backend

- **NestJS:** Follow existing module/controller/service structure. Use DTOs with class-validator.
- **Auth:** Use `@Public()` for public routes; rely on `JwtAuthGuard` and `CurrentUser` for protected routes.
- **Errors:** Use Nest HTTP exceptions (`BadRequestException`, `NotFoundException`, etc.); the global filter will shape the response.
- **Formatting:** Use the backend’s ESLint/Prettier; run `npm run lint` from `backend/` before pushing.

---

## Testing

- **Frontend:** `npm run test` (Vitest) from repo root. Add or update tests for new behavior where practical.
- **Backend:** `npm run test` (Jest) from `backend/`. For API-level changes, consider `npm run test:e2e`.
- We don’t require full coverage for every PR, but meaningful changes should have or extend tests where it makes sense.

---

## Scope & Priorities

- **Small fixes:** Typo fixes, doc updates, config tweaks — direct PRs are fine.
- **Larger or breaking changes:** Open an **Issue** first to discuss approach and scope.
- **Alignment with audit:** For production-readiness, priority fixes are listed in [docs/TECHNICAL-AUDIT.md](docs/TECHNICAL-AUDIT.md) (P0/P1). New features are best built after those are addressed.

If you’re unsure whether a change is in scope, open an issue and we’ll help clarify.

---

Thank you for contributing to DocuMind (Insight Garden).
