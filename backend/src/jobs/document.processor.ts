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
import { ChatCacheService } from '../rag/chat-cache.service.js';
import { LlmService } from '../rag/llm.service.js';
import { DocumentSummaryService } from '../rag/document-summary.service.js';
import { collectionCacheScope } from '../collections/collections.service.js';
import { FAILURE_REASONS, mapFailureReason } from './failure-reason.js';

const QUEUE_NAME = 'document-processing';

/** Progress: 0% start, 30% after chunking, 30–90% embedding loop, 100% DONE */
const PROGRESS_AFTER_CHUNKING = 30;
const PROGRESS_EMBEDDING_START = 30;
const PROGRESS_EMBEDDING_END = 90;

/** Chunks per embedding request / bulk insert (~384 SQL params per insert). */
const EMBED_BATCH_SIZE = 64;

/** Concurrent situating-context LLM calls (contextual retrieval). */
const CONTEXT_CONCURRENCY = 8;
/** Document intro passed to the situating prompt. */
const CONTEXT_DOC_INTRO_CHARS = 1500;

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
    private readonly chatCache: ChatCacheService,
    private readonly llmService: LlmService,
    private readonly summaryService: DocumentSummaryService,
  ) {
    super();
  }

  /**
   * Contextual retrieval (Anthropic-style): one short situating sentence per
   * chunk, prepended before embedding AND stored, so both dense and lexical
   * retrieval see it. Opt-in via CONTEXTUAL_RETRIEVAL=true (adds one cheap
   * LLM call per chunk to ingestion). Failures fall back to the bare chunk —
   * context generation must never fail ingestion.
   */
  private async situateChunks(
    docName: string,
    docIntro: string,
    contents: string[],
  ): Promise<string[]> {
    const out = new Array<string>(contents.length).fill('');
    for (let i = 0; i < contents.length; i += CONTEXT_CONCURRENCY) {
      const slice = contents.slice(i, i + CONTEXT_CONCURRENCY);
      const results = await Promise.allSettled(
        slice.map((chunk) =>
          this.llmService.complete(
            `Document "${docName}" begins:\n${docIntro}\n\n` +
              `Here is one chunk from that document:\n${chunk.slice(0, 2000)}\n\n` +
              `Write ONE short sentence situating this chunk within the overall document, to improve search retrieval of the chunk. Respond with only that sentence.`,
          ),
        ),
      );
      results.forEach((r, j) => {
        if (r.status === 'fulfilled') out[i + j] = r.value.trim();
      });
    }
    return out;
  }

  /**
   * Drop cached collection-chat answers for every collection containing this
   * document: reprocessing changes chunk content without changing membership,
   * so the membership-hashed scope alone would keep serving stale answers.
   */
  private async invalidateCollectionsContaining(
    documentId: string,
  ): Promise<void> {
    const memberships = await this.prisma.collectionDocument.findMany({
      where: { documentId },
      select: { collectionId: true },
    });
    for (const { collectionId } of memberships) {
      const members = await this.prisma.collectionDocument.findMany({
        where: { collectionId },
        select: { documentId: true },
      });
      await this.chatCache.invalidateScope(
        collectionCacheScope(
          collectionId,
          members.map((m) => m.documentId),
        ),
      );
    }
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

    // Chunks are about to change; cached answers for this document — and for
    // any collection containing it (reprocess keeps the membership hash) —
    // are stale.
    await this.chatCache.invalidateScope(documentId);
    await this.invalidateCollectionsContaining(documentId);

    const ok = await this.updateProgress(documentId, document.userId, {
      status: DocumentStatus.PROCESSING,
      progress: 0,
      stage: 'EXTRACTING',
      failureReason: null,
      pageCount: null,
      chunkCount: null,
    });
    if (!ok) return;

    try {
      if (!document.filePath) {
        await this.setFailed(
          documentId,
          document.userId,
          'No file path',
          FAILURE_REASONS.missingFile,
        );
        return;
      }

      const absolutePath = path.join(process.cwd(), document.filePath);
      const buffer = await readFile(absolutePath);

      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await parser.getText();
      // Per-page extraction: build the full text ourselves from page texts so
      // char offsets map deterministically onto page numbers for citations.
      const pageTexts: Array<{ num: number; text: string }> =
        textResult?.pages?.map((pg: { num: number; text: string }) => ({
          num: pg.num,
          text: pg.text ?? '',
        })) ?? [];
      await parser.destroy();

      const PAGE_JOIN = '\n\n';
      let text = '';
      const pageBounds: Array<{ start: number; end: number; num: number }> = [];
      for (const pg of pageTexts) {
        if (text.length > 0) text += PAGE_JOIN;
        const start = text.length;
        text += pg.text;
        pageBounds.push({ start, end: text.length, num: pg.num });
      }
      if (pageTexts.length === 0) text = textResult?.text ?? '';
      const pageForOffset = (offset: number): number | null => {
        for (const b of pageBounds) {
          if (offset >= b.start && offset <= b.end) return b.num;
        }
        return pageBounds.length > 0
          ? pageBounds[pageBounds.length - 1].num
          : null;
      };

      const pageCount =
        textResult?.total ?? (pageTexts.length > 0 ? pageTexts.length : null);
      const okExtract = await this.updateProgress(documentId, document.userId, {
        stage: 'CHUNKING',
        pageCount,
      });
      if (!okExtract) return;

      const textChunks = chunkText(text);
      if (textChunks.length === 0) {
        // No extractable text (e.g. scanned PDF): a DONE-with-zero-chunks
        // document looks like a stuck success ("Ready" but chat has nothing
        // to read). Mark FAILED with a friendly scanned-PDF hint instead.
        await this.setFailed(
          documentId,
          document.userId,
          'No extractable text',
          FAILURE_REASONS.noText,
        );
        return;
      }

      const okChunk = await this.updateProgress(documentId, document.userId, {
        progress: PROGRESS_AFTER_CHUNKING,
        stage: 'EMBEDDING',
      });
      if (!okChunk) return;

      const startedAt = Date.now();
      const contextual = process.env.CONTEXTUAL_RETRIEVAL === 'true';
      const docIntro = contextual ? text.slice(0, CONTEXT_DOC_INTRO_CHARS) : '';
      const totalChunks = textChunks.length;
      for (let start = 0; start < totalChunks; start += EMBED_BATCH_SIZE) {
        const batch = textChunks.slice(start, start + EMBED_BATCH_SIZE);
        let contents = batch.map((c) => c.content);
        if (contextual) {
          const situating = await this.situateChunks(
            document.name,
            docIntro,
            contents,
          );
          contents = contents.map((c, i) =>
            situating[i] ? `${situating[i]}\n${c}` : c,
          );
        }
        const embeddings = await this.embeddingService.embedBatch(contents);
        await this.documentChunkService.insertChunks(
          documentId,
          batch.map((c, i) => ({
            content: contents[i],
            embedding: embeddings[i],
            chunkIndex: c.index,
            charStart: c.charStart,
            charEnd: c.charEnd,
            pageStart: pageForOffset(c.charStart),
            pageEnd: pageForOffset(Math.max(c.charStart, c.charEnd - 1)),
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

      const okFinal = await this.updateProgress(documentId, document.userId, {
        stage: 'FINALIZING',
        chunkCount: totalChunks,
      });
      if (!okFinal) return;

      // Instant activation: one LLM call for summary + suggested questions.
      // Best-effort — a failure logs a warning and the document still goes DONE.
      await this.summaryService.generateForText(
        documentId,
        document.name,
        text,
      );

      await this.updateProgress(documentId, document.userId, {
        status: DocumentStatus.DONE,
        progress: 100,
        stage: null,
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
        mapFailureReason(err),
      );
    }
  }

  private async updateProgress(
    documentId: string,
    _userId: string,
    updates: {
      status?: DocumentStatus;
      progress?: number;
      stage?: string | null;
      failureReason?: string | null;
      pageCount?: number | null;
      chunkCount?: number | null;
    },
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

  /**
   * Mark FAILED. `reason` is logged (may contain raw error details);
   * `safeReason` is the sanitized user-facing message stored on the row.
   */
  private async setFailed(
    documentId: string,
    userId: string,
    reason: string,
    safeReason: string,
  ): Promise<void> {
    this.logger.warn(`Document ${documentId} marked FAILED: ${reason}`);
    await this.updateProgress(documentId, userId, {
      status: DocumentStatus.FAILED,
      progress: 100,
      stage: null,
      failureReason: safeReason,
    });
  }
}
