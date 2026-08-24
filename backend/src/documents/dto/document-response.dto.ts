import { DocumentStatus } from '../../../generated/prisma/enums.js';

/**
 * Response shape aligned with frontend store: Document
 * @see frontend src/stores/useAppStore.ts
 */
export interface DocumentResponseDto {
  id: string;
  name: string;
  uploadedAt: Date;
  status: DocumentStatus;
  progress: number;
  size?: number;
  pageCount?: number;
  chunkCount?: number;
  /** EXTRACTING | CHUNKING | EMBEDDING | FINALIZING while PROCESSING. */
  stage?: string;
  /** Safe, user-facing reason when status is FAILED. */
  failureReason?: string;
  /** ~3-sentence LLM summary; null until generated (instant activation). */
  summary: string | null;
  /** Suggested questions the document can answer; null until generated. */
  suggestedQuestions: string[] | null;
}

/** Paginated documents list. */
export interface DocumentListResponseDto {
  items: DocumentResponseDto[];
  total: number;
}
