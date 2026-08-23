import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Job } from 'bullmq';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { DocumentChunkService } from '../chunks/document-chunk.service.js';
import { chunkText } from '../lib/chunking.js';

const QUEUE_NAME = 'document-processing';

/** Progress: 0% start, 30% after chunking, 30–90% embedding loop, 100% DONE */
const PROGRESS_AFTER_CHUNKING = 30;
const PROGRESS_EMBEDDING_START = 30;
const PROGRESS_EMBEDDING_END = 90;

/** Chunks per embedding request / bulk insert (~384 SQL params per insert). */
const EMBED_BATCH_SIZE = 64;

export interface ProcessDocumentPayload {
  documentId: string;
  userId: string;
}

@Processor(QUEUE_NAME, {
  concurrency: 3,
  // Cap embedding request rate across concurrent jobs; sized well under
  // OpenAI tier-1 RPM limits (each unit of work = one batched API call).
  limiter: { max: 10, duration: 1000 },
})
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    private readonly documentChunkService: DocumentChunkService,
  ) {
    super();
  }

  async process(job: Job<ProcessDocumentPayload>): Promise<void> {
    const { documentId, userId } = job.data;

    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) {
      this.logger.warn(`Document ${documentId} not found, skipping job`);
      return;
    }
    if (document.userId !== userId) {
      this.logger.warn(
        `Document ${documentId} not owned by user ${userId}, skipping job`,
      );
      return;
    }

    const ok = await this.updateProgress(documentId, document.userId, {
      status: DocumentStatus.PROCESSING,
      progress: 0,
    });
    if (!ok) return;

    try {
      if (!document.filePath) {
        await this.setFailed(documentId, document.userId, 'No file path');
        return;
      }

      const absolutePath = path.join(process.cwd(), document.filePath);
      const buffer = await readFile(absolutePath);

      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      const text = textResult?.text ?? '';
      await parser.destroy();

      const textChunks = chunkText(text, { chunkSize: 900, overlap: 100 });
      if (textChunks.length === 0) {
        textChunks.push({ content: '', index: 0 });
      }

      const okChunk = await this.updateProgress(documentId, document.userId, {
        progress: PROGRESS_AFTER_CHUNKING,
      });
      if (!okChunk) return;

      const startedAt = Date.now();
      const totalChunks = textChunks.length;
      for (let start = 0; start < totalChunks; start += EMBED_BATCH_SIZE) {
        const batch = textChunks.slice(start, start + EMBED_BATCH_SIZE);
        const embeddings = await this.embeddingService.embedBatch(
          batch.map((c) => c.content),
        );
        await this.documentChunkService.insertChunks(
          documentId,
          batch.map((c, i) => ({
            content: c.content,
            embedding: embeddings[i],
            chunkIndex: c.index,
          })),
        );
        // One progress write per batch, not per chunk.
        const done = Math.min(start + batch.length, totalChunks);
        const progress = Math.min(
          PROGRESS_EMBEDDING_END,
          PROGRESS_EMBEDDING_START +
            Math.round(
              (done / totalChunks) *
                (PROGRESS_EMBEDDING_END - PROGRESS_EMBEDDING_START),
            ),
        );
        const okProgress = await this.updateProgress(
          documentId,
          document.userId,
          { progress },
        );
        if (!okProgress) return;
      }

      await this.updateProgress(documentId, document.userId, {
        status: DocumentStatus.DONE,
        progress: 100,
      });
      this.logger.log(
        `Document ${documentId} processed successfully (${totalChunks} chunks in ${Date.now() - startedAt}ms embed+insert)`,
      );
    } catch (err) {
      this.logger.error(`Document ${documentId} processing failed:`, err);
      try {
        const deleted =
          await this.documentChunkService.deleteByDocumentId(documentId);
        if (deleted > 0) {
          this.logger.log(
            `Deleted ${deleted} partial chunks for document ${documentId}`,
          );
        }
      } catch (cleanupErr) {
        this.logger.warn(
          `Cleanup of chunks for ${documentId} failed:`,
          cleanupErr,
        );
      }
      await this.setFailed(
        documentId,
        document.userId,
        err instanceof Error ? err.message : 'Processing failed',
      );
    }
  }

  private async updateProgress(
    documentId: string,
    _userId: string,
    updates: { status?: DocumentStatus; progress?: number },
  ): Promise<boolean> {
    try {
      await this.prisma.document.update({
        where: { id: documentId },
        data: updates,
      });
      return true;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2025') {
        this.logger.warn(
          `Document ${documentId} no longer exists (deleted?), exiting`,
        );
        return false;
      }
      throw e;
    }
  }

  private async setFailed(
    documentId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    this.logger.warn(`Document ${documentId} marked FAILED: ${reason}`);
    await this.updateProgress(documentId, userId, {
      status: DocumentStatus.FAILED,
      progress: 100,
    });
  }
}
