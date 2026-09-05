# Railway (documind-api service): Root Directory = "backend", Dockerfile Path =
# "backend/Dockerfile" (dockerfilePath is repo-root-relative, NOT relative to
# Root Directory — a mismatch here silently builds the wrong Dockerfile, since
# the repo also has a root-level Dockerfile for the documind-web frontend).

# ── Dependencies layer ───────────────────────────────────────────────────────
# Cached by Docker as long as package.json / package-lock.json are unchanged.
# Only reinstalls when the lockfile actually changes — not on every source edit.
FROM node:20-alpine AS deps

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Build layer ──────────────────────────────────────────────────────────────
FROM deps AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy everything needed at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/database-url.ts ./database-url.ts

EXPOSE 3000

# prisma migrate deploy runs first (idempotent — safe on every cold start)
CMD ["npm", "run", "start:prod"]
