import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  RetrievalService,
  type RetrievalDebugCollector,
  type RrfCandidateMeta,
} from './retrieval.service.js';
import { PromptService, type HistoryTurn } from '../rag/prompt.service.js';
import { LlmService } from '../rag/llm.service.js';
import { ChatCacheService } from '../rag/chat-cache.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { logRagLatency } from '../rag/rag-latency.logger.js';
import type {
  ChatResponseDto,
  ChatSourceDto,
  RagCacheStatus,
  RagDebugCandidateDto,
  RagDebugDto,
  RagDebugTimingsDto,
} from './dto/chat-response.dto.js';

const NO_INFO_ANSWER = "I don't have enough information to answer that.";
/** When retrieval returns no chunks (document not indexed or no rows). */
const NO_CHUNKS_ANSWER =
  'No content was found for this document. It may still be processing (ensure Redis is running), or the file may have no extractable text. Try again in a moment or re-upload a PDF with selectable text.';
/** When all retrieved chunks are empty (e.g. image-only PDF). */
const NO_EXTRACTABLE_TEXT_ANSWER =
  'This document has no extractable text (e.g. image-only or scanned PDF). Try uploading a PDF with selectable text.';
const DEFAULT_TOP_K = 4;

export interface RagChatInput {
  userId: string;
  documentId: string;
  question: string;
  topK?: number;
  /** Recent conversation turns, oldest first (token-capped downstream). */
  history?: HistoryTurn[];
  /** When true, collect and return retrieval debug info (RagDebugDto). */
  debug?: boolean;
}

/** Stream event: delta (token) or done (sources). Transport-agnostic; consumed by SSE or other transports. */
export type RagStreamEvent =
  | { type: 'delta'; data: string }
  | { type: 'error'; data: { message: string } }
  | {
      type: 'done';
      data: { sources: ChatSourceDto[]; cached?: boolean; debug?: RagDebugDto };
    };

export interface BuildRagDebugArgs {
  /** The request's debug flag: falsy → no payload, zero work. */
  debug: boolean | undefined;
  documentId: string;
  cacheStatus: RagCacheStatus;
  semanticSimilarity?: number;
  timings: RagDebugTimingsDto;
  /** Fusion metadata from the retrieval debug collector (empty on cache hits). */
  candidates?: RrfCandidateMeta[];
  /** Chunk indices that survived prompt context trimming. */
  includedChunkIndices?: number[];
  topK: number;
  historyTurns: number;
}

/**
 * Assemble the RagDebugDto for a chat response. Pure and exported for tests.
 * Returns undefined unless the request explicitly set debug: true, so
 * non-debug responses never carry a debug key.
 */
export function buildRagDebug(
  args: BuildRagDebugArgs,
): RagDebugDto | undefined {
  if (!args.debug) return undefined;
  const round = (n: number): number => Math.round(n * 10) / 10;
  const includedSet = new Set(args.includedChunkIndices ?? []);
  const candidates: RagDebugCandidateDto[] = (args.candidates ?? []).map(
    (c) => {
      const included = c.retained && includedSet.has(c.chunkIndex);
      return {
        chunkIndex: c.chunkIndex,
        documentId: args.documentId,
        ...(c.denseScore !== undefined ? { denseScore: c.denseScore } : {}),
        ...(c.lexicalScore !== undefined
          ? { lexicalScore: c.lexicalScore }
          : {}),
        rrfScore: c.rrfScore,
        retained: c.retained,
        included,
        ...(included ? { marker: `[Chunk ${c.chunkIndex}]` } : {}),
      };
    },
  );
  return {
    cacheStatus: args.cacheStatus,
    ...(args.semanticSimilarity !== undefined
      ? { semanticSimilarity: args.semanticSimilarity }
      : {}),
    timings: {
      embedMs: round(args.timings.embedMs),
      retrievalMs: round(args.timings.retrievalMs),
      promptBuildMs: round(args.timings.promptBuildMs),
      ...(args.timings.llmFirstTokenMs !== undefined
        ? { llmFirstTokenMs: round(args.timings.llmFirstTokenMs) }
        : {}),
      totalMs: round(args.timings.totalMs),
    },
    candidates,
    topK: args.topK,
    historyTurns: args.historyTurns,
  };
}

/** Score of the top-ranked source, or null when there are none. */
function topScoreOf(sources: ChatSourceDto[]): number | null {
  if (sources.length === 0) return null;
  return sources.reduce((max, s) => (s.score > max ? s.score : max), -Infinity);
}

/**
 * RAG v1: grounded answer generation without streaming.
 * Orchestrates retrieval → prompt → LLM → { answer, sources }.
 * RetrievalService enforces ownership and DONE status; this service does not.
 */
@Injectable()
export class RagOrchestratorService {
  private readonly logger = new Logger(RagOrchestratorService.name);

  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly promptService: PromptService,
    private readonly llmService: LlmService,
    private readonly chatCache: ChatCacheService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Cache pre-checks shared by chat() and streamAnswer(). Callers enforce
   * document ownership BEFORE the orchestrator runs, so serving from cache
   * cannot leak across users. Returns the hit (if any) and the query
   * embedding (cached or freshly computed) for retrieval reuse.
   */
  /** Cache scope: topK plus a digest of the conversation history. */
  private settingsKeyFor(topK: number, history: HistoryTurn[]): string {
    if (history.length === 0) return `k${topK}`;
    const digest = createHash('sha256')
      .update(JSON.stringify(history.map((h) => [h.role, h.content.trim()])))
      .digest('hex')
      .slice(0, 16);
    return `k${topK}:h${digest}`;
  }

  private async checkCache(
    documentId: string,
    settingsKey: string,
    question: string,
    t0: number,
  ): Promise<{
    hit: ChatResponseDto | null;
    queryEmbedding: number[];
    cacheStatus: RagCacheStatus;
    semanticSimilarity?: number;
    /** Time spent computing the query embedding (0 when served from cache). */
    embedMs: number;
  }> {
    const exact = await this.chatCache.getExact(
      documentId,
      settingsKey,
      question,
    );
    if (exact) {
      this.logger.log(
        `[chat-cache] exact hit doc=${documentId} in ${Math.round(performance.now() - t0)}ms`,
      );
      return {
        hit: { ...exact, cached: true },
        queryEmbedding: [],
        cacheStatus: 'exact',
        embedMs: 0,
      };
    }
    let queryEmbedding = await this.chatCache.getQueryEmbedding(question);
    let embedMs = 0;
    if (!queryEmbedding) {
      const t0Embed = performance.now();
      queryEmbedding = await this.embeddingService.embed(question);
      embedMs = performance.now() - t0Embed;
      void this.chatCache.storeQueryEmbedding(question, queryEmbedding);
    }
    const semantic = await this.chatCache.getSemantic(
      documentId,
      settingsKey,
      queryEmbedding,
    );
    if (semantic) {
      this.logger.log(
        `[chat-cache] semantic hit doc=${documentId} sim=${semantic.similarity.toFixed(4)} in ${Math.round(performance.now() - t0)}ms`,
      );
      return {
        hit: { ...semantic.hit, cached: true },
        queryEmbedding,
        cacheStatus: 'semantic',
        semanticSimilarity: semantic.similarity,
        embedMs,
      };
    }
    this.logger.log(`[chat-cache] miss doc=${documentId}`);
    return { hit: null, queryEmbedding, cacheStatus: 'miss', embedMs };
  }

  /**
   * Run RAG: retrieve chunks, build grounded prompt, call LLM, return answer and sources.
   * If no chunks are returned, responds with the fallback message and empty sources.
   */
  async chat(input: RagChatInput): Promise<ChatResponseDto> {
    const { userId, documentId, question, topK = DEFAULT_TOP_K } = input;
    const history = input.history ?? [];
    const t0Total = performance.now();
    const trimmedQuestion = question?.trim() ?? '';
    if (!trimmedQuestion) {
      return { answer: NO_INFO_ANSWER, sources: [] };
    }

    const settingsKey = this.settingsKeyFor(topK, history);
    const cache = await this.checkCache(
      documentId,
      settingsKey,
      trimmedQuestion,
      t0Total,
    );
    if (cache.hit) {
      const totalMs = performance.now() - t0Total;
      logRagLatency({
        documentId,
        cacheStatus: cache.cacheStatus,
        chunkCount: cache.hit.sources.length,
        topScore: topScoreOf(cache.hit.sources),
        embedMs: cache.embedMs,
        retrievalMs: 0,
        promptBuildMs: 0,
        ttftMs: null,
        totalMs,
      });
      const debug = buildRagDebug({
        debug: input.debug,
        documentId,
        cacheStatus: cache.cacheStatus,
        semanticSimilarity: cache.semanticSimilarity,
        timings: {
          embedMs: cache.embedMs,
          retrievalMs: 0,
          promptBuildMs: 0,
          totalMs,
        },
        topK,
        historyTurns: history.length,
      });
      return debug ? { ...cache.hit, debug } : cache.hit;
    }

    const debugCollector: RetrievalDebugCollector | undefined = input.debug
      ? {}
      : undefined;
    const t0Retrieval = performance.now();
    const chunks = await this.retrievalService.retrieve(
      {
        userId,
        documentId,
        query: trimmedQuestion,
        topK,
        queryEmbedding: cache.queryEmbedding,
      },
      debugCollector,
    );
    const retrievalMs = performance.now() - t0Retrieval;

    if (!chunks.length) {
      return { answer: NO_CHUNKS_ANSWER, sources: [] };
    }

    const hasAnyContent = chunks.some((c) => c.content.trim().length > 0);
    if (!hasAnyContent) {
      return { answer: NO_EXTRACTABLE_TEXT_ANSWER, sources: [] };
    }

    const t0Prompt = performance.now();
    const { messages, includedChunkIndices } =
      this.promptService.buildRagMessages(
        chunks.map((c) => ({
          content: c.content,
          chunkIndex: c.chunkIndex,
          score: c.score,
        })),
        trimmedQuestion,
        history,
      );
    const promptBuildMs = performance.now() - t0Prompt;

    const answer = await this.llmService.completeMessages(messages);
    const totalMs = performance.now() - t0Total;

    logRagLatency({
      documentId,
      cacheStatus: 'miss',
      chunkCount: chunks.length,
      topScore: chunks[0]?.score ?? null,
      embedMs: cache.embedMs,
      retrievalMs,
      promptBuildMs,
      ttftMs: null,
      totalMs,
    });

    const chunkByIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
    const sources: ChatSourceDto[] = includedChunkIndices
      .map((idx) => chunkByIndex.get(idx))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({
        chunkIndex: c.chunkIndex,
        score: c.score,
        snippet: this.makeSnippet(c.content),
      }));

    // Cached entries never store debug data — it is recomputed per request.
    void this.chatCache.store(
      documentId,
      settingsKey,
      trimmedQuestion,
      cache.queryEmbedding,
      answer,
      sources,
    );
    const debug = buildRagDebug({
      debug: input.debug,
      documentId,
      cacheStatus: 'miss',
      timings: { embedMs: cache.embedMs, retrievalMs, promptBuildMs, totalMs },
      candidates: debugCollector?.candidates,
      includedChunkIndices,
      topK,
      historyTurns: history.length,
    });
    return debug ? { answer, sources, debug } : { answer, sources };
  }

  /** Extract a clean snippet from chunk content (first sentence or first 120 chars). */
  private makeSnippet(content: string, maxLen = 120): string {
    const trimmed = content.replace(/\s+/g, ' ').trim();
    if (trimmed.length <= maxLen) return trimmed;
    // Prefer breaking at the end of the first sentence
    const sentenceEnd = trimmed.search(/[.!?]\s/);
    if (sentenceEnd > 0 && sentenceEnd < maxLen) {
      return trimmed.slice(0, sentenceEnd + 1);
    }
    // Fall back to word boundary
    const wordBreak = trimmed.lastIndexOf(' ', maxLen);
    return trimmed.slice(0, wordBreak > 0 ? wordBreak : maxLen) + '…';
  }

  /**
   * Stream RAG answer: retrieval → prompt → LLM stream.
   * Yields delta events (tokens) then a done event (sources).
   * If no chunks, yields a single delta with fallback answer then done with empty sources.
   * Pass AbortSignal to cancel (e.g. client disconnect); orchestration stays transport-agnostic.
   */
  async *streamAnswer(
    input: RagChatInput,
    signal?: AbortSignal,
  ): AsyncGenerator<RagStreamEvent, void, undefined> {
    const { userId, documentId, question, topK = DEFAULT_TOP_K } = input;
    const history = input.history ?? [];
    const t0Total = performance.now();
    const trimmedQuestion = question?.trim() ?? '';

    if (!trimmedQuestion) {
      yield { type: 'delta', data: NO_INFO_ANSWER };
      yield { type: 'done', data: { sources: [] } };
      return;
    }

    const settingsKey = this.settingsKeyFor(topK, history);
    const cache = await this.checkCache(
      documentId,
      settingsKey,
      trimmedQuestion,
      t0Total,
    );
    if (cache.hit) {
      // Replay the cached answer over the same SSE protocol, in word-group
      // deltas, so the client code path is identical to a live stream.
      const words = cache.hit.answer.split(/(\s+)/);
      let piece = '';
      for (const w of words) {
        piece += w;
        if (piece.length >= 60) {
          yield { type: 'delta', data: piece };
          piece = '';
        }
      }
      if (piece.length > 0) yield { type: 'delta', data: piece };
      const totalMs = performance.now() - t0Total;
      logRagLatency({
        documentId,
        cacheStatus: cache.cacheStatus,
        chunkCount: cache.hit.sources.length,
        topScore: topScoreOf(cache.hit.sources),
        embedMs: cache.embedMs,
        retrievalMs: 0,
        promptBuildMs: 0,
        ttftMs: null,
        totalMs,
      });
      const debug = buildRagDebug({
        debug: input.debug,
        documentId,
        cacheStatus: cache.cacheStatus,
        semanticSimilarity: cache.semanticSimilarity,
        timings: {
          embedMs: cache.embedMs,
          retrievalMs: 0,
          promptBuildMs: 0,
          totalMs,
        },
        topK,
        historyTurns: history.length,
      });
      yield {
        type: 'done',
        data: {
          sources: cache.hit.sources,
          cached: true,
          ...(debug ? { debug } : {}),
        },
      };
      return;
    }

    const debugCollector: RetrievalDebugCollector | undefined = input.debug
      ? {}
      : undefined;
    const t0Retrieval = performance.now();
    const chunks = await this.retrievalService.retrieve(
      {
        userId,
        documentId,
        query: trimmedQuestion,
        topK,
        queryEmbedding: cache.queryEmbedding,
      },
      debugCollector,
    );
    const retrievalMs = performance.now() - t0Retrieval;

    if (!chunks.length) {
      yield { type: 'delta', data: NO_CHUNKS_ANSWER };
      yield { type: 'done', data: { sources: [] } };
      return;
    }

    const hasAnyContent = chunks.some((c) => c.content.trim().length > 0);
    if (!hasAnyContent) {
      yield { type: 'delta', data: NO_EXTRACTABLE_TEXT_ANSWER };
      yield { type: 'done', data: { sources: [] } };
      return;
    }

    const t0Prompt = performance.now();
    const { messages, includedChunkIndices } =
      this.promptService.buildRagMessages(
        chunks.map((c) => ({
          content: c.content,
          chunkIndex: c.chunkIndex,
          score: c.score,
        })),
        trimmedQuestion,
        history,
      );
    const promptBuildMs = performance.now() - t0Prompt;

    let llmFirstTokenMs: number | undefined;
    let ttftMs: number | undefined;
    let firstTokenRecorded = false;
    const t0Llm = performance.now();

    let tokenYielded = false;
    let fullAnswer = '';
    let errored = false;
    try {
      for await (const token of this.llmService.streamMessages(
        messages,
        signal,
      )) {
        if (signal?.aborted) break;
        if (!firstTokenRecorded) {
          llmFirstTokenMs = performance.now() - t0Llm;
          ttftMs = performance.now() - t0Total;
          firstTokenRecorded = true;
        }
        tokenYielded = true;
        fullAnswer += token;
        yield { type: 'delta', data: token };
      }
    } catch (err) {
      errored = true;
      if (!signal?.aborted) {
        // Log the real provider error; send a generic one to the client.
        // Mid-stream failures previously truncated the answer silently.
        this.logger.error(
          `LLM stream failed for doc=${documentId} after ${fullAnswer.length} chars`,
          err instanceof Error ? err.message : err,
        );
        yield {
          type: 'error',
          data: {
            message: tokenYielded
              ? 'The answer was interrupted by a provider error.'
              : 'The answer could not be generated. Please try again.',
          },
        };
      }
    } finally {
      // Always send 'done' so the frontend can exit streaming state (stops blinking cursor).
      // If the LLM stream errors or is aborted, we still yield done with the sources we have.
      const sources: ChatSourceDto[] = (() => {
        const chunkByIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
        return includedChunkIndices
          .map((idx) => chunkByIndex.get(idx))
          .filter((c): c is NonNullable<typeof c> => c != null)
          .map((c) => ({
            chunkIndex: c.chunkIndex,
            score: c.score,
            snippet: this.makeSnippet(c.content),
          }));
      })();
      const totalMs = performance.now() - t0Total;
      logRagLatency({
        documentId,
        cacheStatus: 'miss',
        chunkCount: chunks.length,
        topScore: chunks[0]?.score ?? null,
        embedMs: cache.embedMs,
        retrievalMs,
        promptBuildMs,
        ttftMs: ttftMs ?? null,
        totalMs,
      });
      if (!errored && !signal?.aborted && fullAnswer.length > 0) {
        // Cached entries never store debug data — it is recomputed per request.
        void this.chatCache.store(
          documentId,
          settingsKey,
          trimmedQuestion,
          cache.queryEmbedding,
          fullAnswer,
          sources,
        );
      }
      const debug = buildRagDebug({
        debug: input.debug,
        documentId,
        cacheStatus: 'miss',
        timings: {
          embedMs: cache.embedMs,
          retrievalMs,
          promptBuildMs,
          ...(llmFirstTokenMs !== undefined ? { llmFirstTokenMs } : {}),
          totalMs,
        },
        candidates: debugCollector?.candidates,
        includedChunkIndices,
        topK,
        historyTurns: history.length,
      });
      yield {
        type: 'done',
        data: { sources, ...(debug ? { debug } : {}) },
      };
    }
  }
}
