import { Injectable } from '@nestjs/common';
import { RetrievalService } from './retrieval.service.js';
import { PromptService } from '../rag/prompt.service.js';
import { LlmService } from '../rag/llm.service.js';
import { logRagLatency } from '../rag/rag-latency.logger.js';
import type {
  ChatResponseDto,
  ChatSourceDto,
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
}

/** Stream event: delta (token) or done (sources). Transport-agnostic; consumed by SSE or other transports. */
export type RagStreamEvent =
  | { type: 'delta'; data: string }
  | { type: 'done'; data: { sources: ChatSourceDto[] } };

/**
 * RAG v1: grounded answer generation without streaming.
 * Orchestrates retrieval → prompt → LLM → { answer, sources }.
 * RetrievalService enforces ownership and DONE status; this service does not.
 */
@Injectable()
export class RagOrchestratorService {
  constructor(
    private readonly retrievalService: RetrievalService,
    private readonly promptService: PromptService,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Run RAG: retrieve chunks, build grounded prompt, call LLM, return answer and sources.
   * If no chunks are returned, responds with the fallback message and empty sources.
   */
  async chat(input: RagChatInput): Promise<ChatResponseDto> {
    const { userId, documentId, question, topK = DEFAULT_TOP_K } = input;
    const trimmedQuestion = question?.trim() ?? '';
    if (!trimmedQuestion) {
      return { answer: NO_INFO_ANSWER, sources: [] };
    }

    const t0Retrieval = performance.now();
    const chunks = await this.retrievalService.retrieve({
      userId,
      documentId,
      query: trimmedQuestion,
      topK,
    });
    const retrievalMs = performance.now() - t0Retrieval;

    if (!chunks.length) {
      return { answer: NO_CHUNKS_ANSWER, sources: [] };
    }

    const hasAnyContent = chunks.some((c) => c.content.trim().length > 0);
    if (!hasAnyContent) {
      return { answer: NO_EXTRACTABLE_TEXT_ANSWER, sources: [] };
    }

    const t0Prompt = performance.now();
    const { prompt, includedChunkIndices } = this.promptService.buildRagPrompt(
      chunks.map((c) => ({
        content: c.content,
        chunkIndex: c.chunkIndex,
        score: c.score,
      })),
      trimmedQuestion,
    );
    const promptBuildMs = performance.now() - t0Prompt;

    const answer = await this.llmService.complete(prompt);

    logRagLatency({ retrievalMs, promptBuildMs });

    const chunkByIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
    const sources: ChatSourceDto[] = includedChunkIndices
      .map((idx) => chunkByIndex.get(idx))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({ chunkIndex: c.chunkIndex, score: c.score }));

    return { answer, sources };
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
    const trimmedQuestion = question?.trim() ?? '';

    if (!trimmedQuestion) {
      yield { type: 'delta', data: NO_INFO_ANSWER };
      yield { type: 'done', data: { sources: [] } };
      return;
    }

    const t0Retrieval = performance.now();
    const chunks = await this.retrievalService.retrieve({
      userId,
      documentId,
      query: trimmedQuestion,
      topK,
    });
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
    const { prompt, includedChunkIndices } = this.promptService.buildRagPrompt(
      chunks.map((c) => ({
        content: c.content,
        chunkIndex: c.chunkIndex,
        score: c.score,
      })),
      trimmedQuestion,
    );
    const promptBuildMs = performance.now() - t0Prompt;

    let llmFirstTokenMs: number | undefined;
    let firstTokenRecorded = false;
    const t0Llm = performance.now();

    try {
      for await (const token of this.llmService.stream(prompt, signal)) {
        if (signal?.aborted) break;
        if (!firstTokenRecorded) {
          llmFirstTokenMs = performance.now() - t0Llm;
          firstTokenRecorded = true;
        }
        yield { type: 'delta', data: token };
      }
    } finally {
      // Always send 'done' so the frontend can exit streaming state (stops blinking cursor).
      // If the LLM stream errors or is aborted, we still yield done with the sources we have.
      const sources: ChatSourceDto[] = (() => {
        const chunkByIndex = new Map(chunks.map((c) => [c.chunkIndex, c]));
        return includedChunkIndices
          .map((idx) => chunkByIndex.get(idx))
          .filter((c): c is NonNullable<typeof c> => c != null)
          .map((c) => ({ chunkIndex: c.chunkIndex, score: c.score }));
      })();
      logRagLatency({ retrievalMs, promptBuildMs, llmFirstTokenMs });
      yield { type: 'done', data: { sources } };
    }
  }
}
