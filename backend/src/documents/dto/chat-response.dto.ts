export interface ChatSourceDto {
  chunkIndex: number;
  score: number;
}

export interface ChatResponseDto {
  answer: string;
  sources: ChatSourceDto[];
}
