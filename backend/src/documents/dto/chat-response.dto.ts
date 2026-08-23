export interface ChatSourceDto {
  chunkIndex: number;
  score: number;
  /** First ~120 chars of the matched chunk — shown as a preview in the UI. */
  snippet: string;
}

export interface ChatResponseDto {
  answer: string;
  sources: ChatSourceDto[];
  /** True when served from the chat cache (exact or semantic hit). */
  cached?: boolean;
}
