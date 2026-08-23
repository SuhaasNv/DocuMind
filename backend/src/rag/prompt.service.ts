import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { countTokens } from '../lib/chunking.js';
import type { ChatMessage } from './llm.service.js';

export const MAX_CHUNK_CHARS_DEFAULT = 2000;
export const MAX_CONTEXT_CHARS_DEFAULT = 8000;
/** Token budget for prior conversation turns included in the prompt. */
export const HISTORY_MAX_TOKENS_DEFAULT = 1000;

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

const CONTEXT_SEPARATOR = '\n\n';

const RAG_RULES = `You are DocuMind, an AI assistant that answers questions about a user's uploaded document.

Follow these rules strictly:

1. Use the provided document context below as your primary source of truth.
2. If the answer is explicitly stated in the document, answer directly and confidently.
3. If the answer is not explicitly stated but can be reasonably inferred from the document:
   - Explain the reasoning clearly.
   - Explicitly state that this part is an inference.
4. If the document does not contain enough information to answer fully:
   - Provide a brief, high-level explanation based on general knowledge.
   - Clearly state that this information is NOT from the document.
5. Never claim that the document says something it does not.
6. Never invent facts, figures, quotes, or citations from the document.
7. Prefer clarity and usefulness over refusal.
8. Be honest about uncertainty.
9. Use the conversation history to resolve references like "it" or "elaborate", but ground every factual claim in the document context.

When helpful, structure your answer using sections such as:
- "From the document"
- "Inference"
- "General context (not from the document)"`;
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

export interface RagMessagesResult {
  messages: ChatMessage[];
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
  private readonly historyMaxTokens: number;

  constructor(private readonly config: ConfigService) {
    // Number(): env values arrive as strings.
    this.maxChunkChars = Number(
      this.config.get<string | number>(
        'MAX_CHUNK_CHARS',
        MAX_CHUNK_CHARS_DEFAULT,
      ),
    );
    this.maxContextChars = Number(
      this.config.get<string | number>(
        'MAX_CONTEXT_CHARS',
        MAX_CONTEXT_CHARS_DEFAULT,
      ),
    );
    this.historyMaxTokens = Number(
      this.config.get<string | number>(
        'HISTORY_MAX_TOKENS',
        HISTORY_MAX_TOKENS_DEFAULT,
      ),
    );
  }

  /**
   * Role-separated RAG prompt: grounding rules + document context as the
   * system message, recent conversation turns (newest kept, token-capped)
   * as user/assistant turns, and the question as the final user message.
   */
  buildRagMessages(
    chunks: ContextChunk[],
    question: string,
    history: HistoryTurn[] = [],
  ): RagMessagesResult {
    const { contextBlocks, includedChunkIndices } = this.buildContext(chunks);

    const system = `${RAG_RULES}

## Document context

${contextBlocks}`;

    const messages: ChatMessage[] = [{ role: 'system', content: system }];
    for (const turn of this.capHistory(history)) {
      messages.push({ role: turn.role, content: turn.content });
    }
    messages.push({ role: 'user', content: question.trim() });
    return { messages, includedChunkIndices };
  }

  /** Keep the newest turns whose total tokens fit the history budget. */
  private capHistory(history: HistoryTurn[]): HistoryTurn[] {
    const kept: HistoryTurn[] = [];
    let total = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const tokens = countTokens(history[i].content);
      if (total + tokens > this.historyMaxTokens) break;
      total += tokens;
      kept.unshift(history[i]);
    }
    return kept;
  }

  /** Shared context assembly for both prompt formats. */
  private buildContext(chunks: ContextChunk[]): {
    contextBlocks: string;
    includedChunkIndices: number[];
  } {
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

    return {
      contextBlocks: blocks.join(CONTEXT_SEPARATOR),
      includedChunkIndices,
    };
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
