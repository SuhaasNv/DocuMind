import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Job } from 'bullmq';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EventsGateway } from '../events/events.gateway.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { DocumentChunkService } from '../chunks/document-chunk.service.js';
import { chunkText } from '../lib/chunking.js';

const QUEUE_NAME = 'document-processing';

/** Progress: 0% start, 30% after chunking, 30–90% embedding loop, 100% DONE */
const PROGRESS_AFTER_CHUNKING = 30;
const PROGRESS_EMBEDDING_START = 30;
const PROGRESS_EMBEDDING_END = 90;

export interface ProcessDocumentPayload {
  documentId: string;
  userId: string;
}

@Processor(QUEUE_NAME)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
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
      this.logger.warn(`Document ${documentId} not owned by user ${userId}, skipping job`);
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

      const totalChunks = textChunks.length;
      for (let i = 0; i < totalChunks; i++) {
        const chunk = textChunks[i];
        const embedding = await this.embeddingService.embed(chunk.content);
        await this.documentChunkService.insertChunk(
          documentId,
          chunk.content,
          embedding,
          chunk.index,
        );
        const progress = Math.min(
          PROGRESS_EMBEDDING_END,
          PROGRESS_EMBEDDING_START +
            Math.round(((i + 1) / totalChunks) * (PROGRESS_EMBEDDING_END - PROGRESS_EMBEDDING_START)),
        );
        const okProgress = await this.updateProgress(documentId, document.userId, { progress });
        if (!okProgress) return;
      }

      await this.updateProgress(documentId, document.userId, {
        status: DocumentStatus.DONE,
        progress: 100,
      });
      this.logger.log(`Document ${documentId} processed successfully (${totalChunks} chunks)`);
    } catch (err) {
      this.logger.error(`Document ${documentId} processing failed:`, err);
      try {
        const deleted = await this.documentChunkService.deleteByDocumentId(documentId);
        if (deleted > 0) {
          this.logger.log(`Deleted ${deleted} partial chunks for document ${documentId}`);
        }
      } catch (cleanupErr) {
        this.logger.warn(`Cleanup of chunks for ${documentId} failed:`, cleanupErr);
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
    userId: string,
    updates: { status?: DocumentStatus; progress?: number },
  ): Promise<boolean> {
    try {
      const doc = await this.prisma.document.update({
        where: { id: documentId },
        data: updates,
      });
      this.eventsGateway.emitDocumentUpdated(userId, {
        documentId: doc.id,
        updates: { status: doc.status, progress: doc.progress },
      });
      return true;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'P2025') {
        this.logger.warn(`Document ${documentId} no longer exists (deleted?), exiting`);
        return false;
      }
      throw e;
    }
  }

  private async setFailed(
    documentId: string,
    userId: string,
    _reason: string,
  ): Promise<void> {
    await this.updateProgress(documentId, userId, {
      status: DocumentStatus.FAILED,
      progress: 100,
    });
  }
}
