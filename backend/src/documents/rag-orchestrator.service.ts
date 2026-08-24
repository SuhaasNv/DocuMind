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
import { parseFollowups } from '../rag/followups.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { estimateTokens, logRagLatency } from '../rag/rag-latency.logger.js';
import type {
  ChatResponseDto,
  ChatSourceDto,
  RagCacheStatus,
  RagDebugCandidateDto,
  RagDebugDto,
  RagDebugTimingsDto,
} from './dto/chat-response.dto.js';
import type { RetrievalResultDto } from './dto/retrieval-response.dto.js';

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
  /** Single-document chat target (mutually exclusive with collection). */
  documentId?: string;
  /**
   * Collection (cross-document) chat target. `scope` is the cache scope key
   * (collectionId + membership hash) and `documents` are the DONE member
   * documents, already ownership-checked by the caller.
   */
  collection?: {
    scope: string;
    documents: Array<{ id: string; name: string }>;
  };
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
      data: {
        sources: ChatSourceDto[];
        cached?: boolean;
        followUps?: string[];
        debug?: RagDebugDto;
      };
    };

export interface BuildRagDebugArgs {
  /** The request's debug flag: falsy → no payload, zero work. */
  debug: boolean | undefined;
  cacheStatus: RagCacheStatus;
  semanticSimilarity?: number;
  timings: RagDebugTimingsDto;
  /**
   * Fusion metadata from the retrieval debug collector, RRF-desc sorted so
   * the first `retained` entries line up 1:1 with the retrieval results
   * array (empty on cache hits).
   */
  candidates?: RrfCandidateMeta[];
  /**
   * Positions into the retrieval results array that made it into the prompt,
   * in prompt (marker) order: includedPositions[j] gets marker j+1.
   */
  includedPositions?: number[];
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
  // Retained candidate at pool index i IS retrieval result i, so a position
  // in includedPositions maps straight onto the candidate pool.
  const markerByPosition = new Map(
    (args.includedPositions ?? []).map((pos, j) => [pos, j + 1]),
  );
  const candidates: RagDebugCandidateDto[] = (args.candidates ?? []).map(
    (c, i) => {
      const marker = c.retained ? markerByPosition.get(i) : undefined;
      return {
        chunkIndex: c.chunkIndex,
        documentId: c.documentId,
        ...(c.denseScore !== undefined ? { denseScore: c.denseScore } : {}),
        ...(c.lexicalScore !== undefined
          ? { lexicalScore: c.lexicalScore }
          : {}),
        rrfScore: c.rrfScore,
        retained: c.retained,
        included: marker !== undefined,
        ...(marker !== undefined ? { marker } : {}),
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
    scope: string,
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
    const exact = await this.chatCache.getExact(scope, settingsKey, question);
    if (exact) {
      this.logger.log(
        `[chat-cache] exact hit scope=${scope} in ${Math.round(performance.now() - t0)}ms`,
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
      scope,
      settingsKey,
      queryEmbedding,
    );
    if (semantic) {
      this.logger.log(
        `[chat-cache] semantic hit scope=${scope} sim=${semantic.similarity.toFixed(4)} in ${Math.round(performance.now() - t0)}ms`,
      );
      return {
        hit: { ...semantic.hit, cached: true },
        queryEmbedding,
        cacheStatus: 'semantic',
        semanticSimilarity: semantic.similarity,
        embedMs,
      };
    }
    this.logger.log(`[chat-cache] miss scope=${scope}`);
    return { hit: null, queryEmbedding, cacheStatus: 'miss', embedMs };
  }

  /** Cache scope: the collection scope key for collection chat, else the document id. */
  private cacheScopeOf(input: RagChatInput): string {
    return input.collection?.scope ?? input.documentId ?? '';
  }

  /** Route retrieval to the single- or cross-document variant. */
  private retrieveFor(
    input: RagChatInput,
    question: string,
    topK: number,
    queryEmbedding: number[],
    debugCollector?: RetrievalDebugCollector,
  ): Promise<RetrievalResultDto[]> {
    if (input.collection) {
      return this.retrievalService.retrieveAcross(
        {
          userId: input.userId,
          documentIds: input.collection.documents.map((d) => d.id),
          query: question,
          topK,
          queryEmbedding,
        },
        debugCollector,
      );
    }
    if (!input.documentId) return Promise.resolve([]);
    return this.retrievalService.retrieve(
      {
        userId: input.userId,
        documentId: input.documentId,
        query: question,
        topK,
        queryEmbedding,
      },
      debugCollector,
    );
  }

  /**
   * Run RAG: retrieve chunks, build grounded prompt, call LLM, return answer and sources.
   * If no chunks are returned, responds with the fallback message and empty sources.
   */
  async chat(input: RagChatInput): Promise<ChatResponseDto> {
    const { question, topK = DEFAULT_TOP_K } = input;
    const history = input.history ?? [];
    const t0Total = performance.now();
    const trimmedQuestion = question?.trim() ?? '';
    if (!trimmedQuestion) {
      return { answer: NO_INFO_ANSWER, sources: [] };
    }

    const scope = this.cacheScopeOf(input);
    const settingsKey = this.settingsKeyFor(topK, history);
    const cache = await this.checkCache(
      scope,
      settingsKey,
      trimmedQuestion,
      t0Total,
    );
    if (cache.hit) {
      const totalMs = performance.now() - t0Total;
      logRagLatency({
        scope,
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
    const chunks = await this.retrieveFor(
      input,
      trimmedQuestion,
      topK,
      cache.queryEmbedding,
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
    const { messages, includedPositions } = this.promptService.buildRagMessages(
      chunks.map((c) => ({ content: c.content, score: c.score })),
      trimmedQuestion,
      history,
    );
    const promptBuildMs = performance.now() - t0Prompt;

    const raw = await this.llmService.completeMessages(messages);
    const { display: answer, followUps } = parseFollowups(raw);
    const totalMs = performance.now() - t0Total;

    const sources = this.buildSources(input, chunks, includedPositions);

    logRagLatency({
      scope,
      cacheStatus: 'miss',
      chunkCount: chunks.length,
      topScore: chunks[0]?.score ?? null,
      embedMs: cache.embedMs,
      retrievalMs,
      promptBuildMs,
      ttftMs: null,
      totalMs,
      tokensIn: estimateTokens(messages.map((m) => m.content).join(' ')),
      tokensOut: estimateTokens(raw),
    });

    // Cached entries never store debug data — it is recomputed per request.
    void this.chatCache.store(
      scope,
      settingsKey,
      trimmedQuestion,
      cache.queryEmbedding,
      answer,
      sources,
      followUps,
    );
    const debug = buildRagDebug({
      debug: input.debug,
      cacheStatus: 'miss',
      timings: { embedMs: cache.embedMs, retrievalMs, promptBuildMs, totalMs },
      candidates: debugCollector?.candidates,
      includedPositions,
      topK,
      historyTurns: history.length,
    });
    return {
      answer,
      sources,
      ...(followUps.length > 0 ? { followUps } : {}),
      ...(debug ? { debug } : {}),
    };
  }

  /**
   * Marker contract: sources are numbered 1..n in prompt-inclusion order
   * (includedPositions, assigned AFTER context trimming), matching the
   * [n] labels the model was shown — so [1] in the answer is sources[0].
   * Positions index the retrieval results array directly, so chunkIndex
   * collisions across documents (collection chat) cannot mis-map a source.
   */
  private buildSources(
    input: RagChatInput,
    chunks: RetrievalResultDto[],
    includedPositions: number[],
  ): ChatSourceDto[] {
    const nameById = new Map(
      input.collection?.documents.map((d) => [d.id, d.name]) ?? [],
    );
    return includedPositions
      .map((pos) => chunks[pos])
      .filter((c): c is RetrievalResultDto => c != null)
      .map((c, i) => ({
        marker: i + 1,
        chunkIndex: c.chunkIndex,
        score: c.score,
        snippet: this.makeSnippet(c.content),
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        quote: c.content.replace(/\s+/g, ' ').trim().slice(0, 150),
        ...(input.collection
          ? {
              documentId: c.documentId,
              documentName: nameById.get(c.documentId),
            }
          : {}),
      }));
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
    const { question, topK = DEFAULT_TOP_K } = input;
    const history = input.history ?? [];
    const t0Total = performance.now();
    const trimmedQuestion = question?.trim() ?? '';

    if (!trimmedQuestion) {
      yield { type: 'delta', data: NO_INFO_ANSWER };
      yield { type: 'done', data: { sources: [] } };
      return;
    }

    const scope = this.cacheScopeOf(input);
    const settingsKey = this.settingsKeyFor(topK, history);
    const cache = await this.checkCache(
      scope,
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
        scope,
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
          ...(cache.hit.followUps?.length
            ? { followUps: cache.hit.followUps }
            : {}),
          ...(debug ? { debug } : {}),
        },
      };
      return;
    }

    const debugCollector: RetrievalDebugCollector | undefined = input.debug
      ? {}
      : undefined;
    const t0Retrieval = performance.now();
    const chunks = await this.retrieveFor(
      input,
      trimmedQuestion,
      topK,
      cache.queryEmbedding,
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
    const { messages, includedPositions } = this.promptService.buildRagMessages(
      chunks.map((c) => ({ content: c.content, score: c.score })),
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
          `LLM stream failed for scope=${scope} after ${fullAnswer.length} chars`,
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
      const sources = this.buildSources(input, chunks, includedPositions);
      const totalMs = performance.now() - t0Total;
      logRagLatency({
        scope,
        cacheStatus: 'miss',
        chunkCount: chunks.length,
        topScore: chunks[0]?.score ?? null,
        embedMs: cache.embedMs,
        retrievalMs,
        promptBuildMs,
        ttftMs: ttftMs ?? null,
        totalMs,
        tokensIn: estimateTokens(messages.map((m) => m.content).join(' ')),
        tokensOut: estimateTokens(fullAnswer),
      });
      // Strip the FOLLOWUPS line BEFORE caching so replays serve the display
      // answer; followUps are stored separately so replays keep the chips.
      const completed = !errored && !signal?.aborted && fullAnswer.length > 0;
      const { display, followUps } = completed
        ? parseFollowups(fullAnswer)
        : { display: '', followUps: [] };
      if (completed && display.length > 0) {
        // Cached entries never store debug data — it is recomputed per request.
        void this.chatCache.store(
          scope,
          settingsKey,
          trimmedQuestion,
          cache.queryEmbedding,
          display,
          sources,
          followUps,
        );
      }
      const debug = buildRagDebug({
        debug: input.debug,
        cacheStatus: 'miss',
        timings: {
          embedMs: cache.embedMs,
          retrievalMs,
          promptBuildMs,
          ...(llmFirstTokenMs !== undefined ? { llmFirstTokenMs } : {}),
          totalMs,
        },
        candidates: debugCollector?.candidates,
        includedPositions,
        topK,
        historyTurns: history.length,
      });
      yield {
        type: 'done',
        data: {
          sources,
          ...(followUps.length > 0 ? { followUps } : {}),
          ...(debug ? { debug } : {}),
        },
      };
    }
  }
}
