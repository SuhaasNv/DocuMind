import { ConfigService } from '@nestjs/config';
import {
  EmbeddingService,
  EMBEDDING_DIMENSION_DEFAULT,
} from './embedding.service.js';

function makeService(env: Record<string, string> = {}): EmbeddingService {
  const config = {
    get: <T>(key: string, defaultValue?: T): T | string =>
      key in env ? env[key] : (defaultValue as T),
  } as ConfigService;
  return new EmbeddingService(config);
}

describe('EmbeddingService (stub provider)', () => {
  it('embedBatch returns one vector per input with the configured dimension', async () => {
    const service = makeService();
    const out = await service.embedBatch(['alpha', 'beta', 'gamma']);
    expect(out).toHaveLength(3);
    for (const vec of out) {
      expect(vec).toHaveLength(EMBEDDING_DIMENSION_DEFAULT);
    }
  });

  it('embedBatch on empty input returns empty array without provider calls', async () => {
    const service = makeService();
    await expect(service.embedBatch([])).resolves.toEqual([]);
  });

  it('is deterministic: same text → same vector; batch matches single embed', async () => {
    const service = makeService();
    const [batched] = await service.embedBatch(['same text']);
    const single = await service.embed('same text');
    expect(batched).toEqual(single);
  });

  it('different texts produce different vectors', async () => {
    const service = makeService();
    const [a, b] = await service.embedBatch(['one', 'two']);
    expect(a).not.toEqual(b);
  });

  it('parses EMBEDDING_DIMENSION from env string (regression: "1536" !== 1536)', () => {
    const service = makeService({ EMBEDDING_DIMENSION: '512' });
    expect(service.getDimension()).toBe(512);
    expect(typeof service.getDimension()).toBe('number');
  });
});
