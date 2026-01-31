import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import type { Document as PrismaDocument } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DocumentChunkService } from '../chunks/document-chunk.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { DocumentResponseDto } from './dto/document-response.dto.js';

const PDF_MIME = 'application/pdf';
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const QUEUE_NAME = 'document-processing';
const UPLOADS_DIR = 'uploads';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentChunkService: DocumentChunkService,
    @InjectQueue(QUEUE_NAME) private readonly documentQueue: Queue,
  ) {}

  async createFromUpload(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file provided');
    }
    if (file.mimetype !== PDF_MIME) {
      throw new BadRequestException('Only PDF files are allowed');
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File size must not exceed 50MB');
    }

    const document = await this.prisma.document.create({
      data: {
        userId,
        name: file.originalname || 'document.pdf',
        status: DocumentStatus.PENDING,
        progress: 0,
        size: file.size,
      },
    });

    const relativePath = path.join(UPLOADS_DIR, `${document.id}.pdf`);
    const absolutePath = path.join(process.cwd(), relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer, { flag: 'w' });

    const documentWithPath = await this.prisma.document.update({
      where: { id: document.id },
      data: { filePath: relativePath },
    });

    await this.documentQueue.add(
      'process',
      { documentId: document.id, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    this.logger.log(
      `Document ${document.id} queued for processing. Ensure Redis is running; watch for "processed successfully" or "processing failed" in logs.`,
    );

    return this.toResponse(documentWithPath);
  }

  async findAllByUser(userId: string): Promise<DocumentResponseDto[]> {
    const documents = await this.prisma.document.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
    });
    return documents.map(this.toResponse);
  }

  async findOne(id: string, userId: string): Promise<DocumentResponseDto> {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return this.toResponse(document);
  }

  async remove(id: string, userId: string): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    await this.prisma.document.delete({ where: { id } });

    if (document.filePath) {
      try {
        const absolutePath = path.join(process.cwd(), document.filePath);
        await unlink(absolutePath);
      } catch (err) {
        this.logger.warn(
          `Failed to delete file for document ${id} at ${document.filePath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Re-enqueue a FAILED document for processing. Clears existing chunks, sets status to PENDING, and adds job.
   */
  async retry(id: string, userId: string): Promise<DocumentResponseDto> {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (document.status !== DocumentStatus.FAILED) {
      throw new BadRequestException(
        `Document cannot be retried. Current status: ${document.status}. Only FAILED documents can be retried.`,
      );
    }
    if (!document.filePath) {
      throw new BadRequestException('Document has no file path; cannot retry.');
    }

    await this.documentChunkService.deleteByDocumentId(id);
    const updated = await this.prisma.document.update({
      where: { id },
      data: { status: DocumentStatus.PENDING, progress: 0 },
    });
    await this.documentQueue.add(
      'process',
      { documentId: id, userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
    this.logger.log(`Document ${id} re-queued for processing (retry).`);
    return this.toResponse(updated);
  }

  /**
   * Get document by id for processing. Returns null if not found or not owned by userId.
   * Used by DocumentProcessor to avoid emitting updates for other users.
   */
  async getDocumentForProcessing(
    documentId: string,
    userId: string,
  ): Promise<{ id: string; userId: string; filePath: string | null } | null> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, userId: true, filePath: true },
    });
    if (!doc || doc.userId !== userId) return null;
    return doc;
  }

  /**
   * Called by job processor (or external) to update progress/status.
   * Throws if document not found (e.g. deleted during processing) — processor should catch and exit.
   */
  async updateProgress(
    documentId: string,
    updates: { status?: DocumentStatus; progress?: number },
  ): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: updates,
    });
  }

  private toResponse(doc: PrismaDocument): DocumentResponseDto {
    return {
      id: doc.id,
      name: doc.name,
      uploadedAt: doc.uploadedAt,
      status: doc.status,
      progress: doc.progress,
      size: doc.size ?? undefined,
    };
  }
}
