import { MeService } from './me.service';
import type { PrismaService } from '../prisma/prisma.service';

interface PrismaMock {
  document: { count: jest.Mock; aggregate: jest.Mock };
  conversationMessage: { count: jest.Mock };
  insight: { count: jest.Mock };
}

function makePrisma(): PrismaMock {
  return {
    document: {
      count: jest.fn().mockResolvedValue(3),
      aggregate: jest.fn().mockResolvedValue({ _sum: { pageCount: 42 } }),
    },
    conversationMessage: { count: jest.fn().mockResolvedValue(7) },
    insight: { count: jest.fn().mockResolvedValue(5) },
  };
}

describe('MeService.getStats', () => {
  it('returns the aggregated shape', async () => {
    const prisma = makePrisma();
    const service = new MeService(prisma as unknown as PrismaService);
    const stats = await service.getStats('user-1');
    expect(stats).toEqual({
      documents: 3,
      pagesIndexed: 42,
      chatsAsked: 7,
      insightsPinned: 5,
      cacheHitRate: null,
    });
    expect(prisma.conversationMessage.count).toHaveBeenCalledWith({
      where: { role: 'user', conversation: { userId: 'user-1' } },
    });
  });

  it('treats a null pageCount sum as 0', async () => {
    const prisma = makePrisma();
    prisma.document.aggregate.mockResolvedValue({ _sum: { pageCount: null } });
    const service = new MeService(prisma as unknown as PrismaService);
    const stats = await service.getStats('user-1');
    expect(stats.pagesIndexed).toBe(0);
  });

  it('caches per user for 60s and recomputes after invalidation', async () => {
    const prisma = makePrisma();
    const service = new MeService(prisma as unknown as PrismaService);
    await service.getStats('user-1');
    await service.getStats('user-1');
    expect(prisma.document.count).toHaveBeenCalledTimes(1);

    await service.getStats('user-2');
    expect(prisma.document.count).toHaveBeenCalledTimes(2);

    service.invalidateStats('user-1');
    await service.getStats('user-1');
    expect(prisma.document.count).toHaveBeenCalledTimes(3);
  });
});
