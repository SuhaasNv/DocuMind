import { aggregateRagDays, type RagDayStats } from './rag-metrics.service';

function day(partial: Partial<RagDayStats> & { date: string }): RagDayStats {
  return {
    count: 0,
    cacheHits: 0,
    retrievalMsSum: 0,
    ttftMsSum: 0,
    ttftCount: 0,
    totalMsSum: 0,
    tokensIn: 0,
    tokensOut: 0,
    ...partial,
  };
}

describe('aggregateRagDays', () => {
  it('returns nulls and zeros with no traffic', () => {
    const stats = aggregateRagDays([
      day({ date: '2026-08-23' }),
      day({ date: '2026-08-24' }),
    ]);
    expect(stats).toEqual({
      totalChats: 0,
      cacheHitRate: null,
      avgRetrievalMs: null,
      avgFirstTokenMs: null,
      avgResponseMs: null,
      tokensIn: 0,
      tokensOut: 0,
      dailyChatActivity: [
        { date: '2026-08-23', count: 0 },
        { date: '2026-08-24', count: 0 },
      ],
    });
  });

  it('averages across days and excludes cache hits from retrieval avg', () => {
    const stats = aggregateRagDays([
      // 3 chats, 1 cache hit → 2 misses with retrieval time.
      day({
        date: '2026-08-23',
        count: 3,
        cacheHits: 1,
        retrievalMsSum: 200, // over the 2 misses
        totalMsSum: 3000,
        ttftMsSum: 800,
        ttftCount: 2,
        tokensIn: 1000,
        tokensOut: 300,
      }),
      day({
        date: '2026-08-24',
        count: 1,
        cacheHits: 1,
        totalMsSum: 50,
        tokensIn: 0,
        tokensOut: 0,
      }),
    ]);

    expect(stats.totalChats).toBe(4);
    expect(stats.cacheHitRate).toBe(0.5); // 2 hits / 4 chats
    expect(stats.avgRetrievalMs).toBe(100); // 200ms over 2 misses
    expect(stats.avgFirstTokenMs).toBe(400); // 800ms over 2 streamed
    expect(stats.avgResponseMs).toBe(762.5); // 3050ms over 4 chats
    expect(stats.tokensIn).toBe(1000);
    expect(stats.tokensOut).toBe(300);
    expect(stats.dailyChatActivity).toEqual([
      { date: '2026-08-23', count: 3 },
      { date: '2026-08-24', count: 1 },
    ]);
  });
});
