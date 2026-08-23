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
  /** Set for collection (cross-document) chat: which document this source came from. */
  documentId?: string;
  /** Set for collection chat: display name of the source document. */
  documentName?: string;
}

export type RagCacheStatus = 'miss' | 'exact' | 'semantic';

export interface RagDebugCandidateDto {
  chunkIndex: number;
  /** Which document this candidate came from (relevant for collection chat). */
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
  /** 1-based citation number matching [n] in the answer; set only when included. */
  marker?: number;
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
  /** Follow-up questions parsed from the model's trailing FOLLOWUPS line. */
  followUps?: string[];
  /** Present only when the request set debug: true. Never cached. */
  debug?: RagDebugDto;
}
