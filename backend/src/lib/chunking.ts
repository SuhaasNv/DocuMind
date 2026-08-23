/**
 * Token-aware recursive text chunking.
 *
 * Splits on paragraph breaks first, then sentences, then hard token cuts,
 * packing segments greedily up to a token budget with token-based overlap
 * between consecutive chunks. Token counts use the cl100k_base tokenizer
 * (gpt-tokenizer), matching OpenAI embedding models.
 *
 * Guarantees:
 * - Empty / whitespace-only input produces ZERO chunks.
 * - Full coverage: every character of the input appears in some chunk
 *   (whitespace between segments may be normalized to the join separator).
 * - No mid-word cuts for text that has sentence structure; texts with no
 *   whitespace at all (base64, CJK) are hard-cut at exact token boundaries,
 *   which decode back to the exact original text (lossless).
 */
import { encode, decode } from 'gpt-tokenizer';

export interface ChunkingOptions {
  /** Target maximum chunk size in tokens (default 400). */
  maxTokens?: number;
  /** Overlap between consecutive chunks in tokens (default 60, ~15%). */
  overlapTokens?: number;
}

const DEFAULT_MAX_TOKENS = 400;
const DEFAULT_OVERLAP_TOKENS = 60;

export interface TextChunk {
  content: string;
  index: number;
}

export function countTokens(text: string): number {
  return encode(text).length;
}

/** Last `n` tokens of `text`, decoded back to exact text. */
function tokenTail(text: string, n: number): string {
  if (n <= 0) return '';
  const tokens = encode(text);
  if (tokens.length <= n) return text;
  return decode(tokens.slice(-n));
}

interface Segment {
  text: string;
  /** Separator used when this segment is appended to a non-empty chunk. */
  sep: string;
}

/** Hard-cut oversized text at exact token boundaries (lossless decode). */
function hardCut(text: string, maxTokens: number): string[] {
  const tokens = encode(text);
  const parts: string[] = [];
  for (let i = 0; i < tokens.length; i += maxTokens) {
    parts.push(decode(tokens.slice(i, i + maxTokens)));
  }
  return parts;
}

/** Split one paragraph into segments each within the token budget. */
function splitParagraph(paragraph: string, maxTokens: number): Segment[] {
  if (countTokens(paragraph) <= maxTokens) {
    return [{ text: paragraph, sep: '\n\n' }];
  }
  const sentences = paragraph.split(/(?<=[.!?])\s+/);
  const segments: Segment[] = [];
  sentences.forEach((sentence, i) => {
    const sep = i === 0 ? '\n\n' : ' ';
    if (countTokens(sentence) <= maxTokens) {
      segments.push({ text: sentence, sep });
    } else {
      hardCut(sentence, maxTokens).forEach((part, j) => {
        segments.push({ text: part, sep: j === 0 ? sep : '' });
      });
    }
  });
  return segments;
}

/**
 * Chunk text into segments of ≤ maxTokens tokens with token-based overlap.
 * Empty input returns an empty array.
 */
export function chunkText(
  text: string,
  options: ChunkingOptions = {},
): TextChunk[] {
  const maxTokens = Math.max(1, options.maxTokens ?? DEFAULT_MAX_TOKENS);
  const overlapTokens = Math.max(
    0,
    Math.min(
      options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
      Math.floor(maxTokens / 2),
    ),
  );

  const trimmed = text?.trim() ?? '';
  if (trimmed.length === 0) return [];

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const segments = paragraphs.flatMap((p) => splitParagraph(p, maxTokens));

  const chunks: TextChunk[] = [];
  let current = '';

  const push = (content: string) => {
    chunks.push({ content, index: chunks.length });
  };

  for (const seg of segments) {
    if (current.length === 0) {
      current = seg.text;
      continue;
    }
    const candidate = current + seg.sep + seg.text;
    if (countTokens(candidate) <= maxTokens) {
      current = candidate;
      continue;
    }
    // Close the current chunk; seed the next with token overlap from its tail.
    push(current);
    const overlap = tokenTail(current, overlapTokens);
    const seeded = overlap.length > 0 ? overlap + ' ' + seg.text : seg.text;
    current = countTokens(seeded) <= maxTokens ? seeded : seg.text;
  }
  if (current.length > 0) push(current);

  return chunks;
}
