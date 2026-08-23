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
    await this.insertChunks(documentId, [{ content, embedding, chunkIndex }]);
  }

  /**
   * Bulk-insert chunks in one multi-row parameterized statement.
   * 6 params per row; callers batch well below Postgres's 65535-param cap.
   */
  async insertChunks(
    documentId: string,
    chunks: Array<{ content: string; embedding: number[]; chunkIndex: number }>,
  ): Promise<void> {
    if (chunks.length === 0) return;
    const now = new Date();
    const params: Array<string | number | Date> = [];
    const rows = chunks.map((chunk) => {
      const base = params.length;
      params.push(
        `chunk-${randomBytes(8).toString('hex')}`,
        documentId,
        chunk.content,
        `[${chunk.embedding.join(',')}]`,
        chunk.chunkIndex,
        now,
      );
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::vector, $${base + 5}, $${base + 6})`;
    });
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO document_chunks (id, document_id, content, embedding, chunk_index, created_at)
       VALUES ${rows.join(', ')}`,
      ...params,
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
