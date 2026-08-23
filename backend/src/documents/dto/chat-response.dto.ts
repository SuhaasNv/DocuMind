export interface ChatSourceDto {
  chunkIndex: number;
  score: number;
  /** First ~120 chars of the matched chunk — shown as a preview in the UI. */
  snippet: string;
}

export type RagCacheStatus = 'miss' | 'exact' | 'semantic';

export interface RagDebugCandidateDto {
  chunkIndex: number;
  documentId?: string;
  /** Dense (pgvector cosine) score, when the chunk appeared in the dense list. */
  denseScore?: number;
  /** Lexical (ts_rank_cd) score, when the chunk appeared in the lexical list. */
  lexicalScore?: number;
  /** Reciprocal Rank Fusion score used for the final ranking. */
  rrfScore: number;
  /** Survived RRF top-K selection. */
  retained: boolean;
  /** Survived prompt context trimming (actually sent to the LLM). */
  included: boolean;
  /** Context marker as it appears in the prompt, e.g. "[Chunk 3]". */
  marker?: string;
}

export interface RagDebugTimingsDto {
  embedMs: number;
  retrievalMs: number;
  promptBuildMs: number;
  llmFirstTokenMs?: number;
  totalMs: number;
}

/** Retrieval transparency payload, returned only when the request set debug: true. */
export interface RagDebugDto {
  cacheStatus: RagCacheStatus;
  /** Similarity of the semantic cache hit, when cacheStatus === 'semantic'. */
  semanticSimilarity?: number;
  timings: RagDebugTimingsDto;
  /** Empty for cache hits (no retrieval ran). */
  candidates: RagDebugCandidateDto[];
  topK: number;
  historyTurns: number;
}

export interface ChatResponseDto {
  answer: string;
  sources: ChatSourceDto[];
  /** True when served from the chat cache (exact or semantic hit). */
  cached?: boolean;
  /** Present only when the request set debug: true. Never cached. */
  debug?: RagDebugDto;
}
