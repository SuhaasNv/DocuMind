import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { randomBytes } from 'node:crypto';

/**
 * Store and delete document chunks with vector embeddings.
 * Uses raw SQL for embedding column (pgvector); Prisma for deletes.
 */
@Injectable()
export class DocumentChunkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a single chunk with embedding. Uses raw SQL for vector column.
   */
  async insertChunk(
    documentId: string,
    content: string,
    embedding: number[],
    chunkIndex: number,
  ): Promise<void> {
    const id = `chunk-${randomBytes(8).toString('hex')}`;
    const embeddingStr = `[${embedding.join(',')}]`;
    const now = new Date();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO document_chunks (id, document_id, content, embedding, chunk_index, created_at)
       VALUES ($1, $2, $3, $4::vector, $5, $6)`,
      id,
      documentId,
      content,
      embeddingStr,
      chunkIndex,
      now,
    );
  }

  /**
   * Delete all chunks for a document (e.g. on processing failure to avoid partial state).
   */
  async deleteByDocumentId(documentId: string): Promise<number> {
    const result = await this.prisma.documentChunk.deleteMany({
      where: { documentId },
    });
    return result.count;
  }
}
