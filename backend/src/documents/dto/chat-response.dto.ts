export interface ChatSourceDto {
  chunkIndex: number;
  score: number;
  /** First ~120 chars of the matched chunk — shown as a preview in the UI. */
  snippet: string;
}

export interface ChatResponseDto {
  answer: string;
  sources: ChatSourceDto[];
}
