/**
 * Split text into chunks with configurable size and overlap.
 * Preserves order; chunkIndex is 0-based.
 */

export interface ChunkingOptions {
  /** Target chunk size in characters (default 900). */
  chunkSize?: number;
  /** Overlap between consecutive chunks in characters (default 100). */
  overlap?: number;
}

const DEFAULT_CHUNK_SIZE = 900;
const DEFAULT_OVERLAP = 100;

export interface TextChunk {
  content: string;
  index: number;
}

/**
 * Chunk text into segments of ~chunkSize chars with ~overlap chars overlap.
 * Last chunk may be shorter. Empty input returns one empty chunk.
 */
export function chunkText(
  text: string,
  options: ChunkingOptions = {},
): TextChunk[] {
  const chunkSize = Math.max(1, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.max(0, Math.min(options.overlap ?? DEFAULT_OVERLAP, chunkSize - 1));
  const step = chunkSize - overlap;

  if (!text || text.length === 0) {
    return [{ content: '', index: 0 }];
  }

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end);
    chunks.push({ content, index });
    if (end >= text.length) break;
    start += step;
    index += 1;
  }

  return chunks;
}
