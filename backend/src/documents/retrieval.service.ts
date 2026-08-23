import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import type { RetrievalResultDto } from './dto/retrieval-response.dto.js';

const DEFAULT_TOP_K = 4;
const MAX_TOP_K = 20;
/** Dense over-fetch factor: RRF needs a candidate pool wider than topK. */
const DENSE_OVERFETCH = 5;
/** Max lexical (full-text) candidates. */
const LEXICAL_CAP = 20;
/** Reciprocal Rank Fusion constant (standard k=60). */
const RRF_K = 60;

export interface RetrievalInput {
  userId: string;
  documentId: string;
  query: string;
  topK?: number;
  /** Precomputed query embedding (skips the embed call when provided). */
  queryEmbedding?: number[];
}

interface CandidateRow {
  id: string;
  content: string;
  chunk_index: number;
  score: number;
}

/** Per-candidate fusion metadata (debug variant only). */
export interface RrfCandidateMeta {
  chunkIndex: number;
  /** Cosine similarity, when the chunk appeared in the dense list. */
  denseScore?: number;
  /** ts_rank_cd, when the chunk appeared in the lexical list. */
  lexicalScore?: number;
  rrfScore: number;
  /** Survived top-K selection (part of the fused result). */
  retained: boolean;
}

/** Optional collector passed to retrieve(); filled only when provided. */
export interface RetrievalDebugCollector {
  candidates?: RrfCandidateMeta[];
}

interface FusedEntry {
  row: CandidateRow;
  rrf: number;
  denseScore?: number;
  lexicalScore?: number;
}

/** Shared fusion core: fused entries sorted by RRF score, descending. */
function fuse(lists: CandidateRow[][], k: number): FusedEntry[] {
  const fused = new Map<string, FusedEntry>();
  lists.forEach((list, listIdx) => {
    list.forEach((row, i) => {
      const entry = fused.get(row.id) ?? { row, rrf: 0 };
      entry.rrf += 1 / (k + i + 1);
      // Dense list is always first; later lists are lexical.
      if (listIdx === 0) {
        entry.denseScore = Number(row.score);
      } else if (entry.lexicalScore === undefined) {
        entry.lexicalScore = Number(row.score);
      }
      fused.set(row.id, entry);
    });
  });
  return Array.from(fused.values()).sort((a, b) => b.rrf - a.rrf);
}

/** Reported score: dense cosine when available (interpretable), else ts_rank. */
function toResultDto(e: FusedEntry): RetrievalResultDto {
  return {
    chunkId: e.row.id,
    content: e.row.content,
    chunkIndex: Number(e.row.chunk_index),
    score: e.denseScore ?? e.lexicalScore ?? 0,
  };
}

/**
 * Reciprocal Rank Fusion over ranked candidate lists (k=60).
 * score(d) = Σ 1/(k + rank_i(d)) over every list containing d (1-based rank).
 * Rank-based, so incomparable score scales (cosine vs ts_rank) fuse cleanly.
 * The reported per-chunk score is the dense cosine similarity when the chunk
 * appeared in the dense list (a real, interpretable number), else ts_rank.
 */
export function rrfFuse(
  lists: CandidateRow[][],
  topK: number,
  k: number = RRF_K,
): RetrievalResultDto[] {
  return fuse(lists, k).slice(0, topK).map(toResultDto);
}

/**
 * Debug variant of rrfFuse: same results, plus per-candidate fusion metadata
 * (per-list scores, RRF score, retained flag) for the full candidate pool.
 */
export function rrfFuseDebug(
  lists: CandidateRow[][],
  topK: number,
  k: number = RRF_K,
): { results: RetrievalResultDto[]; candidates: RrfCandidateMeta[] } {
  const entries = fuse(lists, k);
  const candidates: RrfCandidateMeta[] = entries.map((e, i) => ({
    chunkIndex: Number(e.row.chunk_index),
    ...(e.denseScore !== undefined ? { denseScore: e.denseScore } : {}),
    ...(e.lexicalScore !== undefined ? { lexicalScore: e.lexicalScore } : {}),
    rrfScore: e.rrf,
    retained: i < topK,
  }));
  return { results: entries.slice(0, topK).map(toResultDto), candidates };
}

/**
 * Read-only retrieval layer: similarity search over document chunks.
 * Enforces ownership and document status. No chat or LLM.
 * Dense: pgvector cosine (HNSW). Lexical: Postgres full-text (tsvector + GIN,
 * ts_rank_cd). Fused with Reciprocal Rank Fusion.
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
   * - If dense returns nothing, falls back to chunk order (unchanged).
   *
   * Pass a debugCollector to receive per-candidate fusion metadata; without
   * one, no debug bookkeeping happens.
   */
  async retrieve(
    input: RetrievalInput,
    debugCollector?: RetrievalDebugCollector,
  ): Promise<RetrievalResultDto[]> {
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
      input.queryEmbedding
        ? Promise.resolve(input.queryEmbedding)
        : this.embeddingService.embed(trimmedQuery),
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

    const denseLimit = Math.min(k * DENSE_OVERFETCH, 50);
    const [denseRows, lexicalRows] = await Promise.all([
      this.runDenseRetrieval(documentId, queryEmbedding, denseLimit),
      this.runLexicalRetrieval(documentId, trimmedQuery),
    ]);

    if (debugCollector) {
      const { results, candidates } = rrfFuseDebug([denseRows, lexicalRows], k);
      debugCollector.candidates = candidates;
      return results;
    }
    return rrfFuse([denseRows, lexicalRows], k);
  }

  /**
   * Dense retrieval: pgvector cosine similarity over the HNSW index.
   * Falls back to chunk order when similarity returns no rows.
   */
  private async runDenseRetrieval(
    documentId: string,
    queryEmbedding: number[],
    limit: number,
  ): Promise<CandidateRow[]> {
    const embeddingStr = `[${queryEmbedding.join(',')}]`;

    let rows = await this.prisma.$queryRawUnsafe<CandidateRow[]>(
      `SELECT id, content, chunk_index,
              (1 - (embedding <=> $1::vector)) AS score
       FROM document_chunks
       WHERE document_id = $2
       ORDER BY embedding <=> $1::vector ASC
       LIMIT $3`,
      embeddingStr,
      documentId,
      limit,
    );

    if (rows.length === 0) {
      this.logger.warn(
        `Retrieval: 0 chunks from similarity for document ${documentId}; trying fallback by order`,
      );
      rows = await this.prisma.$queryRawUnsafe<CandidateRow[]>(
        `SELECT id, content, chunk_index, 0.5 AS score
         FROM document_chunks
         WHERE document_id = $1
         ORDER BY chunk_index ASC
         LIMIT $2`,
        documentId,
        limit,
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
   * Lexical retrieval: Postgres full-text search over the generated tsvector
   * column (GIN-indexed), ranked with ts_rank_cd. plainto_tsquery handles
   * tokenization, stemming, and stop words; user input is never interpolated.
   */
  private async runLexicalRetrieval(
    documentId: string,
    query: string,
  ): Promise<CandidateRow[]> {
    const rows = await this.prisma.$queryRawUnsafe<CandidateRow[]>(
      `SELECT id, content, chunk_index,
              ts_rank_cd(content_tsv, q) AS score
       FROM document_chunks, plainto_tsquery('english', $2) q
       WHERE document_id = $1 AND content_tsv @@ q
       ORDER BY score DESC
       LIMIT $3`,
      documentId,
      query,
      LEXICAL_CAP,
    );
    return rows;
  }
}
