import { ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Role } from '../../generated/prisma/client.js';
import { collectionCacheScope } from '../collections/collections.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChatCacheService } from '../rag/chat-cache.service.js';
import type { Queue } from 'bullmq';
import { unlink } from 'node:fs/promises';

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}));

const unlinkMock = unlink as jest.MockedFunction<typeof unlink>;

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
}

function setup() {
  const prisma: PrismaMock = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const invalidateScope = jest.fn().mockResolvedValue(undefined);
  const chatCache = { invalidateScope } as unknown as ChatCacheService;
  const queue = {} as Queue;
  const service = new AdminService(
    prisma as unknown as PrismaService,
    chatCache,
    queue,
  );
  return { service, prisma, invalidateScope };
}

const ADMIN_ID = 'admin-1';

describe('AdminService user guards', () => {
  beforeEach(() => unlinkMock.mockClear());

  it('refuses self-demotion with 409 regardless of admin count', async () => {
    const { service, prisma } = setup();
    await expect(
      service.updateUserRole(ADMIN_ID, ADMIN_ID, Role.USER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses demoting the only remaining admin with 409', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-admin',
      role: Role.ADMIN,
    });
    prisma.user.count.mockResolvedValue(1);
    await expect(
      service.updateUserRole(ADMIN_ID, 'other-admin', Role.USER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin remains', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-admin',
      role: Role.ADMIN,
    });
    prisma.user.count.mockResolvedValue(2);
    prisma.user.update.mockResolvedValue({ id: 'other-admin', role: 'USER' });
    await service.updateUserRole(ADMIN_ID, 'other-admin', Role.USER);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { role: Role.USER } }),
    );
  });

  it('404s role change for unknown user', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      service.updateUserRole(ADMIN_ID, 'nope', Role.USER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses self-deletion with 409', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteUser(ADMIN_ID, ADMIN_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses deleting the only remaining admin with 409', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'other-admin',
      role: Role.ADMIN,
      documents: [],
      collections: [],
    });
    prisma.user.count.mockResolvedValue(1);
    await expect(
      service.deleteUser(ADMIN_ID, 'other-admin'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
});

describe('AdminService complete user deletion', () => {
  beforeEach(() => unlinkMock.mockClear());

  const target = {
    id: 'user-2',
    role: Role.USER,
    documents: [
      { id: 'doc-a', filePath: 'uploads/a.pdf' },
      { id: 'doc-b', filePath: null },
    ],
    collections: [{ id: 'col-1', documents: [{ documentId: 'doc-a' }] }],
  };

  it('deletes DB row, unlinks files, and invalidates cache scopes', async () => {
    const { service, prisma, invalidateScope } = setup();
    prisma.user.findUnique.mockResolvedValue(target);

    await expect(service.deleteUser(ADMIN_ID, 'user-2')).resolves.toEqual({
      success: true,
    });

    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'user-2' },
    });
    // Only documents with a filePath are unlinked.
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0][0]).toContain('uploads/a.pdf');
    // Per-document scopes + owned collection scopes.
    expect(invalidateScope).toHaveBeenCalledWith('doc-a');
    expect(invalidateScope).toHaveBeenCalledWith('doc-b');
    expect(invalidateScope).toHaveBeenCalledWith(
      collectionCacheScope('col-1', ['doc-a']),
    );
  });

  it('still succeeds when a file unlink fails (best-effort)', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(target);
    unlinkMock.mockRejectedValueOnce(new Error('ENOENT'));

    await expect(service.deleteUser(ADMIN_ID, 'user-2')).resolves.toEqual({
      success: true,
    });
    expect(prisma.user.delete).toHaveBeenCalled();
  });

  it('404s deletion of unknown user without touching disk', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.deleteUser(ADMIN_ID, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(unlinkMock).not.toHaveBeenCalled();
  });
});
