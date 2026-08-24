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
  /** Estimated prompt tokens (providers don't surface usage; ~chars/4). Absent on cache hits. */
  tokensIn?: number;
  /** Estimated completion tokens (~chars/4). Absent on cache hits. */
  tokensOut?: number;
}

/**
 * Rough token estimate (chars/4) for cost accounting.
 * ponytail: heuristic; switch to provider usage when LlmService surfaces it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type RagMetricsRecorder = (payload: RagLatencyPayload) => void;
let recorder: RagMetricsRecorder | null = null;

/** Registered by RagMetricsService so each log line also feeds Redis counters. */
export function setRagMetricsRecorder(fn: RagMetricsRecorder | null): void {
  recorder = fn;
}

/**
 * Always-on metrics: one structured JSON log line per chat (this is the
 * metrics story — grep "RagLatency" in production logs).
 */
export function logRagLatency(payload: RagLatencyPayload): void {
  try {
    recorder?.(payload);
  } catch {
    // Metrics are best-effort; never throw into the chat path.
  }
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
