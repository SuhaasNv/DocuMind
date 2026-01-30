import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import type { RetrievalResultDto } from './dto/retrieval-response.dto.js';

const DEFAULT_TOP_K = 4;
const MAX_TOP_K = 20;
/** Stop including chunks when score drops by more than this from the previous chunk. */
const SCORE_DROP_THRESHOLD = 0.15;

export interface RetrievalInput {
  userId: string;
  documentId: string;
  query: string;
  topK?: number;
}

/**
 * Read-only retrieval layer: similarity search over document chunks.
 * Enforces ownership and document status. No chat or LLM.
 * Runs document lookup and query embedding in parallel for lower latency.
 * Stops early when similarity drops sharply (fewer, higher-quality chunks).
 */
@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Retrieve top-k chunks by cosine similarity to the query.
   * - If document does not exist or user does not own it → return [].
   * - If document status !== DONE → throw 400.
   * - Document check and query embedding run in parallel.
   * - Chunks are trimmed when score drops sharply from the previous (early stop).
   */
  async retrieve(input: RetrievalInput): Promise<RetrievalResultDto[]> {
    const { userId, documentId, query, topK = DEFAULT_TOP_K } = input;
    const k = Math.min(Math.max(1, topK), MAX_TOP_K);
    const trimmedQuery = query?.trim() ?? '';
    if (!trimmedQuery) {
      return [];
    }

    const [document, queryEmbedding] = await Promise.all([
      this.prisma.document.findUnique({
        where: { id: documentId },
        select: { id: true, userId: true, status: true },
      }),
      this.embeddingService.embed(trimmedQuery),
    ]);

    if (!document) {
      return [];
    }
    if (document.userId !== userId) {
      return [];
    }
    if (document.status !== DocumentStatus.DONE) {
      throw new BadRequestException(
        `Document is not ready for retrieval. Current status: ${document.status}. Wait until processing is complete.`,
      );
    }

    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; chunk_index: number; score: number }>
    >(
      `SELECT id, content, chunk_index,
              (1 - (embedding <=> $1::vector)) AS score
       FROM document_chunks
       WHERE document_id = $2
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $3`,
      embeddingStr,
      documentId,
      k,
    );

    // Fallback: when similarity returns no rows (e.g. stub embeddings or sparse data),
    // return first chunks by order so the user still gets context.
    if (rows.length === 0) {
      this.logger.warn(
        `Retrieval: 0 chunks from similarity for document ${documentId}; trying fallback by order`,
      );
      rows = await this.prisma.$queryRawUnsafe<
        Array<{ id: string; content: string; chunk_index: number; score: number }>
      >(
        `SELECT id, content, chunk_index, 0.5 AS score
         FROM document_chunks
         WHERE document_id = $1
         ORDER BY chunk_index ASC
         LIMIT $2`,
        documentId,
        k,
      );
      if (rows.length === 0) {
        this.logger.warn(
          `Retrieval: 0 chunks for document ${documentId}. Document may not be processed yet. Ensure Redis is running and the upload job completed (check backend logs for "processed successfully").`,
        );
      }
    }

    const mapped = rows.map((row) => ({
      chunkId: row.id,
      content: row.content,
      score: Number(row.score),
      chunkIndex: Number(row.chunk_index),
    }));

    return this.trimByScoreDrop(mapped);
  }

  /**
   * Keep chunks until similarity drops sharply from the previous (prefer fewer, higher-score chunks).
   */
  private trimByScoreDrop(
    chunks: RetrievalResultDto[],
  ): RetrievalResultDto[] {
    if (chunks.length <= 1) return chunks;
    const out: RetrievalResultDto[] = [chunks[0]!];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!.score;
      const curr = chunks[i]!.score;
      if (prev - curr > SCORE_DROP_THRESHOLD) break;
      out.push(chunks[i]!);
    }
    return out;
  }
}
