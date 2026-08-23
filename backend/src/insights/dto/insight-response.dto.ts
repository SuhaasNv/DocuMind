export interface InsightSourceSnapshot {
  marker?: number | null;
  chunkIndex: number;
  score: number;
  snippet?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  quote?: string | null;
  documentId?: string | null;
  documentName?: string | null;
}

export interface InsightResponseDto {
  id: string;
  question: string;
  content: string;
  sources: InsightSourceSnapshot[];
  documentId: string | null;
  documentName: string | null;
  collectionId: string | null;
  userNote: string | null;
  tags: string[];
  createdAt: Date;
}

export interface InsightListResponseDto {
  insights: InsightResponseDto[];
  total: number;
  page: number;
  limit: number;
}
