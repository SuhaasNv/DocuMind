/**
 * FOLLOWUPS parsing (Phase 8): the RAG prompt asks the model to append one
 * final line — `FOLLOWUPS: ["q1","q2","q3"]` — after its answer. This module
 * strips that line from the display answer and extracts the questions.
 * Pure and dependency-free; mirrored on the frontend in src/lib/followups.ts.
 */

export interface ParsedFollowups {
  /** Answer with the trailing FOLLOWUPS line removed. */
  display: string;
  /** Parsed follow-up questions; empty when missing or malformed. */
  followUps: string[];
}

const MAX_FOLLOWUPS = 3;

/** Trailing `FOLLOWUPS: ...` line, optionally wrapped in a markdown fence. */
const FOLLOWUPS_LINE =
  /(?:^|\n)\s*(?:```(?:json)?\s*\n?)?FOLLOWUPS:\s*([^\n]*?)\s*(?:\n\s*```)?\s*$/;

/**
 * Split a raw answer into display text and follow-up questions.
 * A trailing FOLLOWUPS line is always stripped; malformed JSON just yields
 * no chips (never an error). Non-string array entries are dropped.
 */
export function parseFollowups(answer: string): ParsedFollowups {
  const match = FOLLOWUPS_LINE.exec(answer);
  if (!match) return { display: answer, followUps: [] };

  let followUps: string[] = [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      followUps = parsed
        .filter(
          (q): q is string => typeof q === 'string' && q.trim().length > 0,
        )
        .map((q) => q.trim())
        .slice(0, MAX_FOLLOWUPS);
    }
  } catch {
    // Malformed JSON: strip the marker line anyway, render no chips.
  }

  const display = answer.slice(0, match.index).replace(/\s+$/, '');
  return { display, followUps };
}
