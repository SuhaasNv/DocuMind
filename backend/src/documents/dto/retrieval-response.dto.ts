export interface RetrievalResultDto {
  chunkId: string;
  content: string;
  score: number;
  chunkIndex: number;
}

export interface RetrievalResponseDto {
  results: RetrievalResultDto[];
}
