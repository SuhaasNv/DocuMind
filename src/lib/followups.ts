/**
 * FOLLOWUPS parsing (frontend mirror of backend/src/rag/followups.ts):
 * the model appends one final line — `FOLLOWUPS: ["q1","q2","q3"]` — after
 * its answer. These helpers strip it from the display text and extract the
 * questions, streaming-safe (the line may arrive split across deltas).
 */

export interface ParsedFollowups {
  /** Answer with the trailing FOLLOWUPS line removed. */
  display: string;
  /** Parsed follow-up questions; empty when missing or malformed. */
  followUps: string[];
}

const MAX_FOLLOWUPS = 3;
const MARKER = 'FOLLOWUPS:';

/** Trailing `FOLLOWUPS: ...` line, optionally wrapped in a markdown fence. */
const FOLLOWUPS_LINE =
  /(?:^|\n)\s*(?:```(?:json)?\s*\n?)?FOLLOWUPS:\s*([^\n]*?)\s*(?:\n\s*```)?\s*$/;

/**
 * Split a raw answer into display text and follow-up questions.
 * A trailing FOLLOWUPS line is always stripped; malformed JSON just yields
 * no chips (never an error).
 */
export function parseFollowups(answer: string): ParsedFollowups {
  const match = FOLLOWUPS_LINE.exec(answer);
  if (!match) return { display: answer, followUps: [] };

  let followUps: string[] = [];
  try {
    const parsed: unknown = JSON.parse(match[1]);
    if (Array.isArray(parsed)) {
      followUps = parsed
        .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
        .map((q) => q.trim())
        .slice(0, MAX_FOLLOWUPS);
    }
  } catch {
    // Malformed JSON: strip the marker line anyway, render no chips.
  }

  const display = answer.slice(0, match.index).replace(/\s+$/, '');
  return { display, followUps };
}

/**
 * Streaming-safe display text for an accumulated buffer: strips a complete
 * trailing FOLLOWUPS line and hides a partially-arrived marker line while
 * the rest of it is still streaming in.
 */
export function stripStreamingTail(buffer: string): string {
  const parsed = parseFollowups(buffer);
  if (parsed.display !== buffer) return parsed.display;
  const newlineIndex = buffer.lastIndexOf('\n');
  const lastLine = buffer
    .slice(newlineIndex + 1)
    .replace(/^\s*(?:```(?:json)?\s*)?/, '');
  if (
    lastLine.length > 0 &&
    (MARKER.startsWith(lastLine) || lastLine.startsWith(MARKER))
  ) {
    return buffer.slice(0, Math.max(0, newlineIndex)).replace(/\s+$/, '');
  }
  return buffer;
}
