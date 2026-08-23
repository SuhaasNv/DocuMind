export interface ChatSourceDto {
  /** 1-based citation number matching [n] markers in the answer and prompt. */
  marker: number;
  chunkIndex: number;
  score: number;
  /** First ~120 chars of the matched chunk — shown as a preview in the UI. */
  snippet: string;
  /** Source-PDF page range; null for chunks ingested before page-aware chunking. */
  pageStart: number | null;
  pageEnd: number | null;
  /** First ~150 chars of the chunk, for highlight-matching in the PDF viewer. */
  quote: string;
}

export interface ChatResponseDto {
  answer: string;
  sources: ChatSourceDto[];
  /** True when served from the chat cache (exact or semantic hit). */
  cached?: boolean;
}
