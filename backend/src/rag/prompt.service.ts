import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const MAX_CHUNK_CHARS_DEFAULT = 2000;
export const MAX_CONTEXT_CHARS_DEFAULT = 8000;

const CONTEXT_SEPARATOR = '\n\n';
/** When chunk scores are within this range, use a smaller context cap (fewer, higher-score chunks). */
const SIMILAR_SCORE_RANGE = 0.1;
/** Multiplier for max context when chunks are highly similar. */
const SIMILAR_SCORE_CONTEXT_RATIO = 0.6;

export interface ContextChunk {
  content: string;
  chunkIndex: number;
  /** Optional score for dynamic context cap when chunks are highly similar. */
  score?: number;
}

export interface RagPromptResult {
  prompt: string;
  /** Chunk indices that were included in the context (order preserved). Used to build sources. */
  includedChunkIndices: number[];
}

/**
 * Centralizes RAG prompt construction.
 * Enforces: answer ONLY from the provided context. No controller logic.
 * Optimizes for quality and latency: per-chunk truncation and hard cap on total context size.
 */
@Injectable()
export class PromptService {
  private readonly maxChunkChars: number;
  private readonly maxContextChars: number;

  constructor(private readonly config: ConfigService) {
    this.maxChunkChars = this.config.get<number>(
      'MAX_CHUNK_CHARS',
      MAX_CHUNK_CHARS_DEFAULT,
    );
    this.maxContextChars = this.config.get<number>(
      'MAX_CONTEXT_CHARS',
      MAX_CONTEXT_CHARS_DEFAULT,
    );
  }

  /**
   * Builds a strict, grounded prompt for the LLM.
   * - Formats context with explicit numbering and chunkIndex labels: [Chunk N].
   * - Truncates each chunk to MAX_CHUNK_CHARS.
   * - Stops adding chunks when total context length would exceed effective cap.
   * - When chunk scores are highly similar (range < SIMILAR_SCORE_RANGE), uses a smaller cap to prefer fewer, higher-score chunks.
   * Returns the prompt and the list of chunk indices included so callers can preserve sources metadata.
   */
  buildRagPrompt(chunks: ContextChunk[], question: string): RagPromptResult {
    const effectiveCap = this.getEffectiveContextCap(chunks);
    const blocks: string[] = [];
    let totalChars = 0;
    const includedChunkIndices: number[] = [];

    for (const c of chunks) {
      const trimmed = c.content.trim();
      const truncated =
        trimmed.length > this.maxChunkChars
          ? trimmed.slice(0, this.maxChunkChars) + '…'
          : trimmed;
      const block = `[Chunk ${c.chunkIndex}]\n${truncated}`;
      const blockLen = block.length;
      const separatorLen = blocks.length > 0 ? CONTEXT_SEPARATOR.length : 0;

      if (totalChars + separatorLen + blockLen > effectiveCap) {
        break;
      }

      blocks.push(block);
      totalChars += separatorLen + blockLen;
      includedChunkIndices.push(c.chunkIndex);
    }

    const contextBlocks = blocks.join(CONTEXT_SEPARATOR);

    const prompt = `You are a precise assistant. Answer the question using ONLY the context below. Do not use any external knowledge.

If the context does not contain enough information to answer the question, say "I don't have enough information to answer that."

## Context

${contextBlocks}

## Question

${question.trim()}

## Instructions

- Answer ONLY from the context above.
- If the answer is not in the context, respond with: "I don't have enough information to answer that."
- Be concise and accurate.`;

    return { prompt, includedChunkIndices };
  }

  /**
   * When chunks have scores and are highly similar (range < SIMILAR_SCORE_RANGE), use a smaller cap.
   */
  private getEffectiveContextCap(chunks: ContextChunk[]): number {
    const scores = chunks
      .map((c) => c.score)
      .filter((s): s is number => typeof s === 'number');
    if (scores.length < 2) return this.maxContextChars;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    if (max - min > SIMILAR_SCORE_RANGE) return this.maxContextChars;
    return Math.floor(this.maxContextChars * SIMILAR_SCORE_CONTEXT_RATIO);
  }
}
