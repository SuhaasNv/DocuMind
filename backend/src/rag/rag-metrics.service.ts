import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../lib/redis-connection.js';
import {
  setRagMetricsRecorder,
  type RagLatencyPayload,
} from './rag-latency.logger.js';

/** Per-day aggregate parsed out of one rag:stats:<date> hash. */
export interface RagDayStats {
  date: string;
  count: number;
  cacheHits: number;
  retrievalMsSum: number;
  ttftMsSum: number;
  ttftCount: number;
  totalMsSum: number;
  tokensIn: number;
  tokensOut: number;
}

export interface RagAggregateStats {
  totalChats: number;
  cacheHitRate: number | null;
  avgRetrievalMs: number | null;
  avgFirstTokenMs: number | null;
  avgResponseMs: number | null;
  tokensIn: number;
  tokensOut: number;
  dailyChatActivity: Array<{ date: string; count: number }>;
}

const KEY_PREFIX = 'rag:stats:';
/** Keep 8 days so a full trailing-7-day window is always available. */
const TTL_SECONDS = 8 * 86400;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Redis-aggregated chat telemetry: per-day hash counters fed by the
 * always-on rag-latency log line. Cheaper than a per-query DB table (no
 * migration, O(1) writes) and TTL-friendly — the admin console only shows
 * a trailing 7-day window, so old days expire themselves.
 *
 * Best-effort by design: every write is fire-and-forget and every failure
 * is swallowed, so Redis trouble can never break chat.
 */
@Injectable()
export class RagMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RagMetricsService.name);
  private readonly client: Redis;

  constructor() {
    this.client = new Redis({
      ...getRedisConnection(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis metrics error: ${err.message}`);
    });
  }

  onModuleInit(): void {
    // Hook into the existing latency logging path (fan-in, zero orchestrator changes).
    setRagMetricsRecorder((payload) => this.record(payload));
  }

  onModuleDestroy(): void {
    setRagMetricsRecorder(null);
    this.client.disconnect();
  }

  /** Fire-and-forget per-day counters; never throws into the chat path. */
  record(payload: RagLatencyPayload): void {
    try {
      const key = `${KEY_PREFIX}${dayKey(new Date())}`;
      const pipeline = this.client.multi().hincrby(key, 'count', 1);
      if (payload.cacheStatus !== 'miss') {
        pipeline.hincrby(key, 'cacheHits', 1);
      }
      pipeline.hincrby(key, 'retrievalMsSum', Math.round(payload.retrievalMs));
      pipeline.hincrby(key, 'totalMsSum', Math.round(payload.totalMs));
      if (payload.ttftMs != null) {
        pipeline
          .hincrby(key, 'ttftMsSum', Math.round(payload.ttftMs))
          .hincrby(key, 'ttftCount', 1);
      }
      if (payload.tokensIn) {
        pipeline.hincrby(key, 'tokensIn', payload.tokensIn);
      }
      if (payload.tokensOut) {
        pipeline.hincrby(key, 'tokensOut', payload.tokensOut);
      }
      pipeline.expire(key, TTL_SECONDS);
      // ponytail: sums+counts only (averages); add fixed histogram buckets when percentiles are needed
      void pipeline.exec().catch(() => undefined);
    } catch {
      /* best-effort */
    }
  }

  /** Aggregate the trailing 7 days (today inclusive), zeros for missing days. */
  async getAggregate(now = new Date()): Promise<RagAggregateStats> {
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      days.push(dayKey(new Date(now.getTime() - i * 86400000)));
    }

    let raw: Array<Record<string, string>>;
    try {
      const pipeline = this.client.multi();
      for (const day of days) pipeline.hgetall(`${KEY_PREFIX}${day}`);
      const results = (await pipeline.exec()) ?? [];
      raw = results.map(([, value]) => (value ?? {}) as Record<string, string>);
    } catch {
      raw = days.map(() => ({}));
    }

    const perDay: RagDayStats[] = days.map((date, i) => {
      const h = raw[i] ?? {};
      const n = (field: string): number => Number(h[field] ?? 0) || 0;
      return {
        date,
        count: n('count'),
        cacheHits: n('cacheHits'),
        retrievalMsSum: n('retrievalMsSum'),
        ttftMsSum: n('ttftMsSum'),
        ttftCount: n('ttftCount'),
        totalMsSum: n('totalMsSum'),
        tokensIn: n('tokensIn'),
        tokensOut: n('tokensOut'),
      };
    });

    return aggregateRagDays(perDay);
  }
}

/** Pure aggregation over per-day stats (unit-testable without Redis). */
export function aggregateRagDays(perDay: RagDayStats[]): RagAggregateStats {
  const sum = (pick: (d: RagDayStats) => number): number =>
    perDay.reduce((acc, d) => acc + pick(d), 0);

  const totalChats = sum((d) => d.count);
  const cacheHits = sum((d) => d.cacheHits);
  // Retrieval average excludes cache hits (their retrievalMs is 0 by definition).
  const misses = totalChats - cacheHits;
  const ttftCount = sum((d) => d.ttftCount);
  const round = (v: number): number => Math.round(v * 10) / 10;

  return {
    totalChats,
    cacheHitRate:
      totalChats > 0
        ? Math.round((cacheHits / totalChats) * 1000) / 1000
        : null,
    avgRetrievalMs:
      misses > 0 ? round(sum((d) => d.retrievalMsSum) / misses) : null,
    avgFirstTokenMs:
      ttftCount > 0 ? round(sum((d) => d.ttftMsSum) / ttftCount) : null,
    avgResponseMs:
      totalChats > 0 ? round(sum((d) => d.totalMsSum) / totalChats) : null,
    tokensIn: sum((d) => d.tokensIn),
    tokensOut: sum((d) => d.tokensOut),
    dailyChatActivity: perDay.map(({ date, count }) => ({ date, count })),
  };
}
