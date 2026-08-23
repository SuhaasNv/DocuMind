import { rrfFuse, rrfFuseDebug } from './retrieval.service.js';

interface Row {
  id: string;
  content: string;
  chunk_index: number;
  score: number;
}

const row = (id: string, score: number, idx = 0): Row => ({
  id,
  content: `content-${id}`,
  chunk_index: idx,
  score,
});

describe('rrfFuse (Reciprocal Rank Fusion, k=60)', () => {
  it('a chunk in both lists outranks single-list chunks at similar ranks', () => {
    const dense = [row('a', 0.9), row('b', 0.8), row('c', 0.7)];
    const lexical = [row('d', 0.5), row('b', 0.4)];
    const out = rrfFuse([dense, lexical], 4);
    // b: 1/62 + 1/62 > a: 1/61 → b first
    expect(out[0].chunkId).toBe('b');
    expect(out.map((r) => r.chunkId)).toContain('a');
  });

  it('rank matters, raw score scale does not (incomparable scales fuse cleanly)', () => {
    const dense = [row('a', 0.99), row('b', 0.98)];
    const lexical = [row('b', 0.0001), row('c', 0.00005)];
    const out = rrfFuse([dense, lexical], 3);
    expect(out[0].chunkId).toBe('b'); // in both lists
  });

  it('respects topK', () => {
    const dense = [row('a', 1), row('b', 0.9), row('c', 0.8), row('d', 0.7)];
    expect(rrfFuse([dense, []], 2)).toHaveLength(2);
  });

  it('reported score is the dense cosine similarity when available', () => {
    const dense = [row('a', 0.87)];
    const lexical = [row('a', 0.0002), row('e', 0.0001)];
    const out = rrfFuse([dense, lexical], 3);
    const a = out.find((r) => r.chunkId === 'a');
    const e = out.find((r) => r.chunkId === 'e');
    expect(a?.score).toBeCloseTo(0.87, 10);
    expect(e?.score).toBeCloseTo(0.0001, 10);
  });

  it('empty lists produce empty output; lexical-only still ranks', () => {
    expect(rrfFuse([[], []], 4)).toEqual([]);
    const out = rrfFuse([[], [row('x', 0.1), row('y', 0.05)]], 4);
    expect(out.map((r) => r.chunkId)).toEqual(['x', 'y']);
  });

  it('maps snake_case rows to the DTO shape', () => {
    const out = rrfFuse([[row('a', 0.5, 7)], []], 1);
    expect(out[0]).toEqual({
      chunkId: 'a',
      content: 'content-a',
      chunkIndex: 7,
      score: 0.5,
    });
  });
});

describe('rrfFuseDebug', () => {
  it('returns the same results as rrfFuse', () => {
    const dense = [row('a', 0.9, 1), row('b', 0.8, 2), row('c', 0.7, 3)];
    const lexical = [row('d', 0.5, 4), row('b', 0.4, 2)];
    expect(rrfFuseDebug([dense, lexical], 2).results).toEqual(
      rrfFuse([dense, lexical], 2),
    );
  });

  it('reports per-list scores: dense-only, lexical-only, and both', () => {
    const dense = [row('a', 0.9, 1), row('b', 0.8, 2)];
    const lexical = [row('b', 0.004, 2), row('c', 0.002, 3)];
    const { candidates } = rrfFuseDebug([dense, lexical], 4);
    const byIdx = new Map(candidates.map((c) => [c.chunkIndex, c]));
    expect(byIdx.get(1)).toMatchObject({ denseScore: 0.9 });
    expect(byIdx.get(1)?.lexicalScore).toBeUndefined();
    expect(byIdx.get(2)).toMatchObject({
      denseScore: 0.8,
      lexicalScore: 0.004,
    });
    expect(byIdx.get(3)).toMatchObject({ lexicalScore: 0.002 });
    expect(byIdx.get(3)?.denseScore).toBeUndefined();
  });

  it('computes RRF scores (1-based ranks, k=60) and sorts descending', () => {
    const dense = [row('a', 0.9, 1), row('b', 0.8, 2)];
    const lexical = [row('b', 0.004, 2)];
    const { candidates } = rrfFuseDebug([dense, lexical], 4);
    expect(candidates[0].chunkIndex).toBe(2); // in both lists
    expect(candidates[0].rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(candidates[1].rrfScore).toBeCloseTo(1 / 61, 12);
  });

  it('marks only the top-K candidates as retained', () => {
    const dense = [row('a', 0.9, 1), row('b', 0.8, 2), row('c', 0.7, 3)];
    const { candidates, results } = rrfFuseDebug([dense, []], 2);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.retained)).toEqual([true, true, false]);
    expect(results).toHaveLength(2);
    expect(new Set(results.map((r) => r.chunkIndex))).toEqual(
      new Set(candidates.filter((c) => c.retained).map((c) => c.chunkIndex)),
    );
  });
});
