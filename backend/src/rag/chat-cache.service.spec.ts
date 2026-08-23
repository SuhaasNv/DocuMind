import { cosineSimilarity, normalizeQuestion } from './chat-cache.service.js';

describe('cosineSimilarity', () => {
  it('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 10);
  });

  it('scale-invariant', () => {
    expect(cosineSimilarity([1, 2, 3], [10, 20, 30])).toBeCloseTo(1, 10);
  });

  it('length mismatch or empty → -1 (never a false hit)', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(-1);
    expect(cosineSimilarity([], [])).toBe(-1);
  });

  it('zero vector → -1 (never a false hit)', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(-1);
  });
});

describe('normalizeQuestion', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeQuestion('  What   IS\tthis? \n')).toBe('what is this?');
  });

  it('equivalent phrasings map to the same exact-cache key input', () => {
    expect(normalizeQuestion('What is DocuMind?')).toBe(
      normalizeQuestion('  what   is documind?  '),
    );
  });
});
