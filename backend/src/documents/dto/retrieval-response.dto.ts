export interface RetrievalResultDto {
  chunkId: string;
  content: string;
  score: number;
  chunkIndex: number;
  /** Source-PDF page range; null for chunks ingested before page-aware chunking. */
  pageStart: number | null;
  pageEnd: number | null;
}

export interface RetrievalResponseDto {
  results: RetrievalResultDto[];
}
