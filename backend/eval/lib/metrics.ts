/** Retrieval quality metrics — pure functions, no I/O, unit-testable. */

/**
 * 1-based rank of the first chunk whose content contains `needle`
 * (case-insensitive), or null if none of the ranked chunks match.
 */
export function firstMatchRank(
  chunks: Array<{ content: string }>,
  needle: string,
): number | null {
  const target = needle.toLowerCase();
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].content.toLowerCase().includes(target)) return i + 1;
  }
  return null;
}

/** Reciprocal rank for one case: 1/rank if found, else 0. */
export function reciprocalRank(rank: number | null): number {
  return rank === null ? 0 : 1 / rank;
}

export interface RetrievalCaseResult {
  id: string;
  found: boolean;
  rank: number | null;
}

/** Recall@k across cases: fraction where the expected chunk was retrieved at all. */
export function recallAtK(results: RetrievalCaseResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.found).length / results.length;
}

/** Mean Reciprocal Rank across cases. */
export function meanReciprocalRank(results: RetrievalCaseResult[]): number {
  if (results.length === 0) return 0;
  const sum = results.reduce((acc, r) => acc + reciprocalRank(r.rank), 0);
  return sum / results.length;
}
