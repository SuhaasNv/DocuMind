/**
 * Token-aware recursive text chunking with source offsets.
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
 * - Each chunk carries charStart/charEnd: the offsets of its own (non-overlap)
 *   content within the ORIGINAL input string, for citation mapping.
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
  /** Offset of this chunk's own content (excluding the overlap seed) in the input. */
  charStart: number;
  /** End offset (exclusive) of this chunk's own content in the input. */
  charEnd: number;
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
  /** Absolute offset of this segment's text in the original input. */
  start: number;
  /** Absolute end offset (exclusive) in the original input. */
  end: number;
}

/** Hard-cut oversized text at exact token boundaries (lossless decode). */
function hardCut(
  text: string,
  baseOffset: number,
  maxTokens: number,
  sepFirst: string,
): Segment[] {
  const tokens = encode(text);
  const parts: Segment[] = [];
  let offset = baseOffset;
  for (let i = 0; i < tokens.length; i += maxTokens) {
    const piece = decode(tokens.slice(i, i + maxTokens));
    parts.push({
      text: piece,
      sep: parts.length === 0 ? sepFirst : '',
      start: offset,
      end: offset + piece.length,
    });
    offset += piece.length;
  }
  return parts;
}

/** Split one paragraph (at absolute offset pStart) into budget-sized segments. */
function splitParagraph(
  paragraph: string,
  pStart: number,
  maxTokens: number,
): Segment[] {
  if (countTokens(paragraph) <= maxTokens) {
    return [
      {
        text: paragraph,
        sep: '\n\n',
        start: pStart,
        end: pStart + paragraph.length,
      },
    ];
  }
  // Sentence boundaries: positions AFTER [.!?] + whitespace.
  const segments: Segment[] = [];
  const boundaries: number[] = [0];
  for (const m of paragraph.matchAll(/(?<=[.!?])\s+/g)) {
    boundaries.push((m.index ?? 0) + m[0].length);
  }
  boundaries.push(paragraph.length);
  for (let b = 0; b < boundaries.length - 1; b++) {
    const rawStart = boundaries[b];
    const raw = paragraph.slice(rawStart, boundaries[b + 1]);
    const sentence = raw.replace(/\s+$/, '');
    if (sentence.length === 0) continue;
    const sStart = pStart + rawStart;
    const sep = segments.length === 0 ? '\n\n' : ' ';
    if (countTokens(sentence) <= maxTokens) {
      segments.push({
        text: sentence,
        sep,
        start: sStart,
        end: sStart + sentence.length,
      });
    } else {
      segments.push(...hardCut(sentence, sStart, maxTokens, sep));
    }
  }
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

  if (!text || text.trim().length === 0) return [];

  // Walk paragraphs with absolute offsets (paragraph = run between blank lines).
  const segments: Segment[] = [];
  const paraRe = /[^\s][\s\S]*?(?=\n\s*\n|$)/g;
  for (const m of text.matchAll(paraRe)) {
    const para = m[0].replace(/\s+$/, '');
    if (para.length === 0) continue;
    segments.push(...splitParagraph(para, m.index ?? 0, maxTokens));
  }

  const chunks: TextChunk[] = [];
  let current = '';
  let currentStart = -1;
  let currentEnd = -1;

  const push = () => {
    chunks.push({
      content: current,
      index: chunks.length,
      charStart: currentStart,
      charEnd: currentEnd,
    });
  };

  for (const seg of segments) {
    if (current.length === 0) {
      current = seg.text;
      currentStart = seg.start;
      currentEnd = seg.end;
      continue;
    }
    const candidate = current + seg.sep + seg.text;
    if (countTokens(candidate) <= maxTokens) {
      current = candidate;
      currentEnd = seg.end;
      continue;
    }
    // Close the current chunk; seed the next with token overlap from its tail.
    push();
    const overlap = tokenTail(current, overlapTokens);
    const seeded = overlap.length > 0 ? overlap + ' ' + seg.text : seg.text;
    current = countTokens(seeded) <= maxTokens ? seeded : seg.text;
    // Offsets always point at the chunk's own content, not the overlap seed.
    currentStart = seg.start;
    currentEnd = seg.end;
  }
  if (current.length > 0) push();

  return chunks;
}
