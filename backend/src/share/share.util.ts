import { randomBytes } from 'node:crypto';

/**
 * Pure helpers for shareable answer links. Kept free of Nest/Prisma so the
 * security-critical logic (token entropy, snapshot whitelist, expiry) is
 * unit-testable in isolation.
 */

/** Public share tokens: 32 lowercase hex chars = 128 bits from crypto.randomBytes. */
export function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

/** Accepted token shape on the public endpoint. Anything else is a 404. */
export const SHARE_TOKEN_RE = /^[a-f0-9]{32,64}$/;

/** Everything a public viewer is allowed to see about one citation. */
export interface SnapshotSource {
  marker: number;
  pageStart: number | null;
  pageEnd: number | null;
  quote: string | null;
  snippet: string;
}

/** The frozen public snapshot. EXACTLY these keys — nothing else survives. */
export interface AnswerSnapshot {
  question: string;
  answer: string;
  sources: SnapshotSource[];
  sharedAt: string;
}

/** Loose input: whatever the client sent. Only whitelisted keys are read. */
export interface SnapshotInput {
  question: string;
  answer: string;
  sources?: readonly object[];
}

const finiteNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * Whitelist serializer. Builds a brand-new object reading ONLY the allowed
 * keys, so hostile/extra/nested keys (chunkIndex, score, documentId, file
 * paths, prototype tricks, ...) can never reach the stored snapshot.
 * Values are length-capped defensively; markers renumbered if missing.
 */
export function buildSnapshot(
  input: SnapshotInput,
  now: Date = new Date(),
): AnswerSnapshot {
  const sources: SnapshotSource[] = (input.sources ?? [])
    .slice(0, 20)
    .map((raw, i) => {
      const s = raw as Record<string, unknown>;
      return {
        marker:
          typeof s.marker === 'number' &&
          Number.isInteger(s.marker) &&
          s.marker > 0
            ? s.marker
            : i + 1,
        pageStart: finiteNumber(s.pageStart),
        pageEnd: finiteNumber(s.pageEnd),
        quote: typeof s.quote === 'string' ? s.quote.slice(0, 2000) : null,
        snippet: typeof s.snippet === 'string' ? s.snippet.slice(0, 1000) : '',
      };
    });
  return {
    question: input.question.slice(0, 4000),
    answer: input.answer.slice(0, 20000),
    sources,
    sharedAt: now.toISOString(),
  };
}

export type ShareState = 'live' | 'gone';

/** Revocation/expiry decision. Revoked wins; expiresAt is inclusive-gone at the instant it passes. */
export function shareState(
  row: { revoked: boolean; expiresAt: Date | null },
  now: Date = new Date(),
): ShareState {
  if (row.revoked) return 'gone';
  if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) {
    return 'gone';
  }
  return 'live';
}
