import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Insight as PrismaInsight } from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateInsightDto } from './dto/create-insight.dto.js';
import type { UpdateInsightDto } from './dto/update-insight.dto.js';
import type { InsightQueryDto } from './dto/insight-query.dto.js';
import type {
  InsightListResponseDto,
  InsightResponseDto,
  InsightSourceSnapshot,
} from './dto/insight-response.dto.js';

/** Hard cap for a single markdown export. */
const EXPORT_CAP = 500;

@Injectable()
export class InsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateInsightDto,
  ): Promise<InsightResponseDto> {
    const insight = await this.prisma.insight.create({
      data: {
        userId,
        question: dto.question,
        content: dto.content,
        // Plain-literal snapshot of the whitelisted source DTOs.
        sources: dto.sources.map((s) => ({
          marker: s.marker ?? null,
          chunkIndex: s.chunkIndex,
          score: s.score,
          snippet: s.snippet ?? null,
          pageStart: s.pageStart ?? null,
          pageEnd: s.pageEnd ?? null,
          quote: s.quote ?? null,
          documentId: s.documentId ?? null,
          documentName: s.documentName ?? null,
        })),
        documentId: dto.documentId ?? null,
        documentName: dto.documentName ?? null,
        collectionId: dto.collectionId ?? null,
      },
    });
    return this.toResponse(insight);
  }

  async findAll(
    userId: string,
    query: InsightQueryDto,
  ): Promise<InsightListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { insights, total } = await this.search(userId, {
      query: query.query,
      tag: query.tag,
      documentId: query.documentId,
      skip: (page - 1) * limit,
      take: limit,
    });
    return { insights, total, page, limit };
  }

  async findForExport(
    userId: string,
    filters: { query?: string; tag?: string },
  ): Promise<InsightResponseDto[]> {
    const { insights } = await this.search(userId, {
      query: filters.query,
      tag: filters.tag,
      skip: 0,
      take: EXPORT_CAP,
    });
    return insights;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateInsightDto,
  ): Promise<InsightResponseDto> {
    await this.assertOwned(id, userId);
    // Only userNote and tags are editable — never the pinned content.
    const updated = await this.prisma.insight.update({
      where: { id },
      data: {
        ...(dto.userNote !== undefined ? { userNote: dto.userNote } : {}),
        ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
      },
    });
    return this.toResponse(updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.assertOwned(id, userId);
    await this.prisma.insight.delete({ where: { id } });
  }

  private async assertOwned(id: string, userId: string): Promise<void> {
    const insight = await this.prisma.insight.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!insight) {
      throw new NotFoundException('Insight not found');
    }
    if (insight.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * Shared listing: full-text (plainto_tsquery over the generated tsvector
   * column, parameterized) when a query is given, plain Prisma otherwise.
   * Always newest first, always scoped to the owner.
   */
  private async search(
    userId: string,
    opts: {
      query?: string;
      tag?: string;
      documentId?: string;
      skip: number;
      take: number;
    },
  ): Promise<{ insights: InsightResponseDto[]; total: number }> {
    const trimmedQuery = opts.query?.trim() ?? '';

    if (trimmedQuery) {
      const [idRows, countRows] = await Promise.all([
        this.prisma.$queryRawUnsafe<Array<{ id: string }>>(
          `SELECT id
           FROM insights, plainto_tsquery('english', $2) q
           WHERE user_id = $1 AND search_tsv @@ q
             AND ($3::text IS NULL OR $3 = ANY(tags))
             AND ($4::text IS NULL OR document_id = $4)
           ORDER BY created_at DESC, id DESC
           LIMIT $5 OFFSET $6`,
          userId,
          trimmedQuery,
          opts.tag ?? null,
          opts.documentId ?? null,
          opts.take,
          opts.skip,
        ),
        this.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT count(*) AS count
           FROM insights, plainto_tsquery('english', $2) q
           WHERE user_id = $1 AND search_tsv @@ q
             AND ($3::text IS NULL OR $3 = ANY(tags))
             AND ($4::text IS NULL OR document_id = $4)`,
          userId,
          trimmedQuery,
          opts.tag ?? null,
          opts.documentId ?? null,
        ),
      ]);
      const ids = idRows.map((r) => r.id);
      const rows = await this.prisma.insight.findMany({
        where: { id: { in: ids } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const insights = ids
        .map((id) => byId.get(id))
        .filter((r): r is PrismaInsight => r !== undefined)
        .map((r) => this.toResponse(r));
      return { insights, total: Number(countRows[0]?.count ?? 0) };
    }

    const where = {
      userId,
      ...(opts.tag ? { tags: { has: opts.tag } } : {}),
      ...(opts.documentId ? { documentId: opts.documentId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.insight.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: opts.skip,
        take: opts.take,
      }),
      this.prisma.insight.count({ where }),
    ]);
    return { insights: rows.map((r) => this.toResponse(r)), total };
  }

  private toResponse(insight: PrismaInsight): InsightResponseDto {
    return {
      id: insight.id,
      question: insight.question,
      content: insight.content,
      sources: (Array.isArray(insight.sources)
        ? insight.sources
        : []) as unknown as InsightSourceSnapshot[],
      documentId: insight.documentId,
      documentName: insight.documentName,
      collectionId: insight.collectionId,
      userNote: insight.userNote,
      tags: insight.tags,
      createdAt: insight.createdAt,
    };
  }
}
