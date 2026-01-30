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
}
