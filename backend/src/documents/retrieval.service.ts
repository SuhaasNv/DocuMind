import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import type { RetrievalResultDto } from './dto/retrieval-response.dto.js';

const DEFAULT_TOP_K = 4;
const MAX_TOP_K = 20;
/** Stop including chunks when score drops by more than this from the previous chunk. */
const SCORE_DROP_THRESHOLD = 0.15;
/** Max lexical results to merge with dense. */
const LEXICAL_CAP = 20;
/** Base score for chunks that appear only in lexical results. */
const LEXICAL_BASE_SCORE = 0.35;
/** Score boost when a chunk appears in both dense and lexical results. */
const HYBRID_BOOST = 0.2;
/** Min keyword length for lexical tokenization. */
const MIN_KEYWORD_LEN = 3;

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
   * Retrieve top-k chunks by hybrid (dense + lexical) retrieval.
   * - If document does not exist or user does not own it → return [].
   * - If document status !== DONE → throw 400.
   * - Dense: pgvector cosine similarity (unchanged).
   * - Lexical: keyword ILIKE over content; merged and re-ranked with dense.
   * - If lexical returns nothing, dense-only behavior is unchanged.
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

    const keywords = this.tokenizeQuery(trimmedQuery);
    const [denseRows, lexicalRows] = await Promise.all([
      this.runDenseRetrieval(documentId, queryEmbedding, k),
      keywords.length > 0
        ? this.runLexicalRetrieval(documentId, keywords)
        : Promise.resolve([]),
    ]);

    const merged = this.mergeAndRank(
      denseRows,
      lexicalRows,
      k,
      documentId,
    );

    return this.trimByScoreDrop(merged);
  }

  /**
   * Tokenize query: lowercase, split on non-word, length >= MIN_KEYWORD_LEN, deduplicate.
   */
  private tokenizeQuery(query: string): string[] {
    const words = query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= MIN_KEYWORD_LEN);
    return [...new Set(words)];
  }

  /**
   * Dense retrieval: pgvector cosine similarity (unchanged from original).
   */
  private async runDenseRetrieval(
    documentId: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<
    Array<{ id: string; content: string; chunk_index: number; score: number }>
  > {
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

    if (rows.length === 0) {
      this.logger.warn(
        `Retrieval: 0 chunks from similarity for document ${documentId}; trying fallback by order`,
      );
      rows = await this.prisma.$queryRawUnsafe<
        Array<{
          id: string;
          content: string;
          chunk_index: number;
          score: number;
        }>
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

    return rows;
  }

  /**
   * Escape ILIKE special chars (%, _) so keywords are matched literally.
   */
  private escapeIlikePattern(kw: string): string {
    return kw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  /**
   * Lexical retrieval: ILIKE over content for keywords; cap at LEXICAL_CAP distinct chunks.
   */
  private async runLexicalRetrieval(
    documentId: string,
    keywords: string[],
  ): Promise<
    Array<{ id: string; content: string; chunk_index: number }>
  > {
    if (keywords.length === 0) return [];

    const patterns = keywords.map((kw) => `%${this.escapeIlikePattern(kw)}%`);
    const placeholders = patterns
      .map((_, i) => `content ILIKE $${i + 2}`)
      .join(' OR ');
    const query = `SELECT DISTINCT ON (id) id, content, chunk_index
       FROM document_chunks
       WHERE document_id = $1 AND (${placeholders})
       ORDER BY id
       LIMIT ${LEXICAL_CAP}`;

    const params = [documentId, ...patterns];
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; content: string; chunk_index: number }>
    >(query, ...params);

    return rows;
  }

  /**
   * Merge dense and lexical by chunkId; dense keep score, lexical-only get LEXICAL_BASE_SCORE,
   * both get HYBRID_BOOST; normalize to [0,1], sort desc, take topK.
   */
  private mergeAndRank(
    denseRows: Array<{
      id: string;
      content: string;
      chunk_index: number;
      score: number;
    }>,
    lexicalRows: Array<{ id: string; content: string; chunk_index: number }>,
    topK: number,
    _documentId: string,
  ): RetrievalResultDto[] {
    const byId = new Map<
      string,
      { chunkId: string; content: string; chunkIndex: number; score: number }
    >();

    for (const row of denseRows) {
      byId.set(row.id, {
        chunkId: row.id,
        content: row.content,
        chunkIndex: Number(row.chunk_index),
        score: Number(row.score),
      });
    }

    const lexicalIds = new Set(lexicalRows.map((r) => r.id));
    for (const row of lexicalRows) {
      const existing = byId.get(row.id);
      if (existing) {
        existing.score += HYBRID_BOOST;
      } else {
        byId.set(row.id, {
          chunkId: row.id,
          content: row.content,
          chunkIndex: Number(row.chunk_index),
          score: LEXICAL_BASE_SCORE,
        });
      }
    }

    let chunks = Array.from(byId.values());
    const maxScore = Math.max(...chunks.map((c) => c.score), 0);
    const minScore = Math.min(...chunks.map((c) => c.score), 0);
    if (maxScore > minScore) {
      chunks = chunks.map((c) => ({
        ...c,
        score: (c.score - minScore) / (maxScore - minScore),
      }));
    } else if (chunks.length > 0) {
      chunks = chunks.map((c) => ({ ...c, score: 1 }));
    }

    chunks.sort((a, b) => b.score - a.score);
    return chunks.slice(0, topK);
  }

  /**
   * Keep chunks until similarity drops sharply from the previous (prefer fewer, higher-score chunks).
   */
  private trimByScoreDrop(chunks: RetrievalResultDto[]): RetrievalResultDto[] {
    if (chunks.length <= 1) return chunks;
    const out: RetrievalResultDto[] = [chunks[0]];
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].score;
      const curr = chunks[i].score;
      if (prev - curr > SCORE_DROP_THRESHOLD) break;
      out.push(chunks[i]);
    }
    return out;
  }
}
