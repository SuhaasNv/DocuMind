import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface MeStatsDto {
  documents: number;
  pagesIndexed: number;
  chatsAsked: number;
  insightsPinned: number;
  cacheHitRate: number | null;
}

/** Per-user stats cache TTL. Writes that change the numbers invalidate it. */
const STATS_TTL_MS = 60_000;

@Injectable()
export class MeService {
  private readonly statsCache = new Map<
    string,
    { at: number; stats: MeStatsDto }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Called after uploads/deletes/chat turns so fresh numbers show promptly. */
  invalidateStats(userId: string): void {
    this.statsCache.delete(userId);
  }

  async getStats(userId: string): Promise<MeStatsDto> {
    const cached = this.statsCache.get(userId);
    if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.stats;

    const [documents, pages, chatsAsked, insightsPinned] = await Promise.all([
      this.prisma.document.count({ where: { userId } }),
      this.prisma.document.aggregate({
        where: { userId },
        _sum: { pageCount: true },
      }),
      this.prisma.conversationMessage.count({
        where: { role: 'user', conversation: { userId } },
      }),
      this.prisma.insight.count({ where: { userId } }),
    ]);

    const stats: MeStatsDto = {
      documents,
      pagesIndexed: pages._sum.pageCount ?? 0,
      chatsAsked,
      insightsPinned,
      // Phase 14 wires real cache telemetry; null means "not yet measured".
      cacheHitRate: null,
    };
    this.statsCache.set(userId, { at: Date.now(), stats });
    return stats;
  }
}
