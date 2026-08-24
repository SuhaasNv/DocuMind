import type { ConfigService } from '@nestjs/config';
import {
  ChatCacheService,
  cosineSimilarity,
  normalizeQuestion,
} from './chat-cache.service.js';

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

/**
 * Regression: the cache fails OPEN — when Redis is unavailable every method
 * returns a miss (null) or resolves silently, so chat still gets a live
 * answer instead of an error.
 */
describe('ChatCacheService fail-open on Redis errors', () => {
  function makeService(): ChatCacheService {
    const config = {
      get: (_key: string, defaultValue?: string | number) => defaultValue,
    } as unknown as ConfigService;
    const service = new ChatCacheService(config);
    const down = () => Promise.reject(new Error('Redis is down'));
    // Replace the (lazy, never-connected) client with one that always fails.
    (service as unknown as { client: Record<string, unknown> }).client = {
      get: down,
      set: down,
      smembers: down,
      mget: down,
      del: down,
      multi: () => {
        throw new Error('Redis is down');
      },
      disconnect: (): void => undefined,
    };
    return service;
  }

  it('getExact and getSemantic return null (miss), never throw', async () => {
    const service = makeService();
    await expect(service.getExact('doc-1', 'k4', 'q?')).resolves.toBeNull();
    await expect(
      service.getSemantic('doc-1', 'k4', [0.1, 0.2]),
    ).resolves.toBeNull();
    await expect(service.getQueryEmbedding('q?')).resolves.toBeNull();
  });

  it('store, storeQueryEmbedding, and invalidateScope resolve silently', async () => {
    const service = makeService();
    await expect(
      service.store('doc-1', 'k4', 'q?', [0.1], 'answer', []),
    ).resolves.toBeUndefined();
    await expect(
      service.storeQueryEmbedding('q?', [0.1]),
    ).resolves.toBeUndefined();
    await expect(service.invalidateScope('doc-1')).resolves.toBeUndefined();
  });
});
