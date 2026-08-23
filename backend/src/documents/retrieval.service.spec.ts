import { rrfFuse } from './retrieval.service.js';

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
