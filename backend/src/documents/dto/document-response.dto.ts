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
  /** ~3-sentence LLM summary; null until generated (instant activation). */
  summary: string | null;
  /** Suggested questions the document can answer; null until generated. */
  suggestedQuestions: string[] | null;
}
