export interface RetrievalResultDto {
  chunkId: string;
  content: string;
  score: number;
  chunkIndex: number;
  /** Source-PDF page range; null for chunks ingested before page-aware chunking. */
  pageStart: number | null;
  pageEnd: number | null;
  /** Owning document — lets cross-document (collection) chat attribute sources. */
  documentId: string;
}

export interface RetrievalResponseDto {
  results: RetrievalResultDto[];
}
