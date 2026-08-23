import { NotFoundException, ForbiddenException } from '@nestjs/common';
import {
  CollectionsService,
  collectionCacheScope,
} from './collections.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChatCacheService } from '../rag/chat-cache.service.js';

describe('collectionCacheScope', () => {
  it('is stable under member reordering', () => {
    expect(collectionCacheScope('col1', ['a', 'b', 'c'])).toBe(
      collectionCacheScope('col1', ['c', 'a', 'b']),
    );
  });

  it('changes when membership changes', () => {
    const base = collectionCacheScope('col1', ['a', 'b']);
    expect(collectionCacheScope('col1', ['a', 'b', 'c'])).not.toBe(base);
    expect(collectionCacheScope('col1', ['a'])).not.toBe(base);
  });

  it('is scoped per collection', () => {
    expect(collectionCacheScope('col1', ['a'])).not.toBe(
      collectionCacheScope('col2', ['a']),
    );
  });

  it('id concatenation cannot collide across boundaries', () => {
    expect(collectionCacheScope('col1', ['ab', 'c'])).not.toBe(
      collectionCacheScope('col1', ['a', 'bc']),
    );
  });
});

describe('CollectionsService.addDocument ownership guard', () => {
  const OWNER = 'user-a';
  const collectionRow = {
    id: 'col1',
    userId: OWNER,
    name: 'My collection',
    createdAt: new Date(),
    documents: [],
  };

  interface MockSetup {
    service: CollectionsService;
    upsert: jest.Mock;
    invalidateScope: jest.Mock;
  }

  function setup(document: { id: string; userId: string } | null): MockSetup {
    const upsert = jest.fn().mockResolvedValue({});
    const invalidateScope = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      collection: {
        findUnique: jest.fn().mockResolvedValue(collectionRow),
      },
      document: {
        findUnique: jest.fn().mockResolvedValue(document),
      },
      collectionDocument: { upsert },
    } as unknown as PrismaService;
    const chatCache = { invalidateScope } as unknown as ChatCacheService;
    return {
      service: new CollectionsService(prisma, chatCache),
      upsert,
      invalidateScope,
    };
  }

  it("adding another user's document → 403, nothing written", async () => {
    const { service, upsert } = setup({ id: 'doc1', userId: 'user-b' });
    await expect(
      service.addDocument('col1', OWNER, 'doc1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('adding a nonexistent document → 404, nothing written', async () => {
    const { service, upsert } = setup(null);
    await expect(
      service.addDocument('col1', OWNER, 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('a non-owner of the collection cannot add even their own document', async () => {
    const { service, upsert } = setup({ id: 'doc1', userId: 'user-b' });
    await expect(
      service.addDocument('col1', 'user-b', 'doc1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('owner adding their own document writes membership and invalidates the old scope', async () => {
    const { service, upsert, invalidateScope } = setup({
      id: 'doc1',
      userId: OWNER,
    });
    await service.addDocument('col1', OWNER, 'doc1');
    expect(upsert).toHaveBeenCalledWith({
      where: {
        collectionId_documentId: { collectionId: 'col1', documentId: 'doc1' },
      },
      create: { collectionId: 'col1', documentId: 'doc1' },
      update: {},
    });
    expect(invalidateScope).toHaveBeenCalledWith(
      collectionCacheScope('col1', []),
    );
  });
});
