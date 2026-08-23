import type { DocumentStatus } from '../../../generated/prisma/enums.js';

export interface CollectionDocumentSummaryDto {
  id: string;
  name: string;
  status: DocumentStatus;
}

export interface CollectionResponseDto {
  id: string;
  name: string;
  createdAt: Date;
  documentCount: number;
  documents: CollectionDocumentSummaryDto[];
}
