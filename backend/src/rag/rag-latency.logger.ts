import { Logger } from '@nestjs/common';
import type { RagCacheStatus } from '../documents/dto/chat-response.dto.js';

const logger = new Logger('RagLatency');

export interface RagLatencyPayload {
  /** Cache scope: the document id, or the collection scope key for collection chat. */
  scope: string;
  cacheStatus: RagCacheStatus;
  /** Retrieved chunks (cache hits: cached source count). */
  chunkCount: number;
  /** Score of the top-ranked chunk (null when nothing was retrieved). */
  topScore: number | null;
  embedMs: number;
  retrievalMs: number;
  promptBuildMs: number;
  /** Time to first LLM token from request start (null for non-stream / cache hits). */
  ttftMs: number | null;
  totalMs: number;
}

/**
 * Always-on metrics: one structured JSON log line per chat (this is the
 * metrics story — grep "RagLatency" in production logs).
 */
export function logRagLatency(payload: RagLatencyPayload): void {
  const ms = (n: number | null): number | null =>
    n == null ? null : Math.round(n * 10) / 10;
  logger.log(
    JSON.stringify({
      scope: payload.scope,
      cacheStatus: payload.cacheStatus,
      chunkCount: payload.chunkCount,
      topScore:
        payload.topScore == null
          ? null
          : Math.round(payload.topScore * 10000) / 10000,
      embedMs: ms(payload.embedMs),
      retrievalMs: ms(payload.retrievalMs),
      promptBuildMs: ms(payload.promptBuildMs),
      ttftMs: ms(payload.ttftMs),
      totalMs: ms(payload.totalMs),
    }),
  );
}
