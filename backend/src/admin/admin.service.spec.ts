import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { validJobId } from './admin.controller';
import { Role } from '../../generated/prisma/client.js';
import { collectionCacheScope } from '../collections/collections.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ChatCacheService } from '../rag/chat-cache.service.js';
import type { RagMetricsService } from '../rag/rag-metrics.service.js';
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
  document: {
    findUnique: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  documentChunk: {
    deleteMany: jest.Mock;
  };
  adminAuditLog: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
}

interface QueueMock {
  getJob: jest.Mock;
  getJobs: jest.Mock;
  clean: jest.Mock;
  add: jest.Mock;
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
    document: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
    documentChunk: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const invalidateScope = jest.fn().mockResolvedValue(undefined);
  const chatCache = { invalidateScope } as unknown as ChatCacheService;
  const ragMetrics = {
    getAggregate: jest.fn(),
  } as unknown as RagMetricsService;
  const queue: QueueMock = {
    getJob: jest.fn(),
    getJobs: jest.fn(),
    clean: jest.fn(),
    add: jest.fn().mockResolvedValue({}),
  };
  const service = new AdminService(
    prisma as unknown as PrismaService,
    chatCache,
    ragMetrics,
    queue as unknown as Queue,
  );
  return { service, prisma, invalidateScope, queue };
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

describe('AdminService job operations', () => {
  it('validJobId rejects empty and oversized ids with 400', () => {
    expect(() => validJobId('')).toThrow(BadRequestException);
    expect(() => validJobId('x'.repeat(129))).toThrow(BadRequestException);
    expect(validJobId('42')).toBe('42');
  });

  it('404s retry of a non-existent job (not 500)', async () => {
    const { service, queue } = setup();
    queue.getJob.mockResolvedValue(undefined);
    await expect(service.retryJob(ADMIN_ID, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('retries only failed jobs, 409 otherwise', async () => {
    const { service, queue } = setup();
    const retry = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('completed'),
      retry,
    });
    await expect(service.retryJob(ADMIN_ID, '1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(retry).not.toHaveBeenCalled();

    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      retry,
    });
    await expect(service.retryJob(ADMIN_ID, '1')).resolves.toEqual({
      success: true,
    });
    expect(retry).toHaveBeenCalled();
  });

  it('404s removal of a non-existent job and removes an existing one', async () => {
    const { service, queue } = setup();
    queue.getJob.mockResolvedValue(undefined);
    await expect(service.removeJob(ADMIN_ID, 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );

    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ remove });
    await expect(service.removeJob(ADMIN_ID, '1')).resolves.toEqual({
      success: true,
    });
    expect(remove).toHaveBeenCalled();
  });

  it('bulk retry skips jobs that fail to retry and reports the count', async () => {
    const { service, queue } = setup();
    queue.getJobs.mockResolvedValue([
      { retry: jest.fn().mockResolvedValue(undefined) },
      { retry: jest.fn().mockRejectedValue(new Error('gone')) },
      { retry: jest.fn().mockResolvedValue(undefined) },
    ]);
    await expect(service.retryAllFailedJobs(ADMIN_ID)).resolves.toEqual({
      retried: 2,
    });
  });

  it('clean reports how many completed jobs were removed', async () => {
    const { service, queue } = setup();
    queue.clean.mockResolvedValue(['1', '2', '3']);
    await expect(service.cleanCompletedJobs(ADMIN_ID)).resolves.toEqual({
      cleaned: 3,
    });
    expect(queue.clean).toHaveBeenCalledWith(0, 1000, 'completed');
  });
});

describe('AdminService document operations', () => {
  beforeEach(() => unlinkMock.mockClear());

  const doc = {
    id: 'doc-1',
    userId: 'user-9',
    filePath: 'uploads/doc-1.pdf',
    collections: [
      {
        collection: {
          id: 'col-1',
          documents: [{ documentId: 'doc-1' }, { documentId: 'doc-2' }],
        },
      },
    ],
  };

  it('deletes DB row, disk file, and invalidates document + collection scopes', async () => {
    const { service, prisma, invalidateScope } = setup();
    prisma.document.findUnique.mockResolvedValue(doc);

    await expect(service.deleteDocument(ADMIN_ID, 'doc-1')).resolves.toEqual({
      success: true,
    });
    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
    });
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(unlinkMock.mock.calls[0][0]).toContain('uploads/doc-1.pdf');
    expect(invalidateScope).toHaveBeenCalledWith('doc-1');
    expect(invalidateScope).toHaveBeenCalledWith(
      collectionCacheScope('col-1', ['doc-1', 'doc-2']),
    );
  });

  it('404s deletion/reprocess of unknown document', async () => {
    const { service, prisma } = setup();
    prisma.document.findUnique.mockResolvedValue(null);
    await expect(
      service.deleteDocument(ADMIN_ID, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.reprocessDocument(ADMIN_ID, 'nope'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reprocess clears chunks, resets to PENDING, and enqueues (any status)', async () => {
    const { service, prisma, queue } = setup();
    prisma.document.findUnique.mockResolvedValue({
      ...doc,
      status: 'DONE',
    });

    await expect(service.reprocessDocument(ADMIN_ID, 'doc-1')).resolves.toEqual(
      {
        success: true,
      },
    );
    expect(prisma.documentChunk.deleteMany).toHaveBeenCalledWith({
      where: { documentId: 'doc-1' },
    });
    const updateCalls = prisma.document.update.mock.calls as Array<
      [{ data: { status: string; progress: number } }]
    >;
    const updateArg = updateCalls[0][0];
    expect(updateArg.data.status).toBe('PENDING');
    expect(updateArg.data.progress).toBe(0);
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { documentId: 'doc-1', userId: 'user-9' },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('409s reprocess when the original file is gone', async () => {
    const { service, prisma, queue } = setup();
    prisma.document.findUnique.mockResolvedValue({ ...doc, filePath: null });
    await expect(
      service.reprocessDocument(ADMIN_ID, 'doc-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe('AdminService audit fan-in', () => {
  beforeEach(() => unlinkMock.mockClear());

  function auditActions(prisma: PrismaMock): string[] {
    const calls = prisma.adminAuditLog.create.mock.calls as Array<
      [{ data: { adminUserId: string; action: string } }]
    >;
    for (const [arg] of calls) {
      expect(arg.data.adminUserId).toBe(ADMIN_ID);
    }
    return calls.map(([arg]) => arg.data.action);
  }

  it('writes an entry for every mutating admin action, with the acting admin', async () => {
    const { service, prisma, queue } = setup();

    prisma.user.findUnique.mockResolvedValue({
      id: 'u2',
      email: 'u2@x.io',
      role: Role.USER,
      documents: [],
      collections: [],
    });
    prisma.user.count.mockResolvedValue(2);
    prisma.user.update.mockResolvedValue({ id: 'u2', role: 'ADMIN' });
    await service.updateUserRole(ADMIN_ID, 'u2', Role.ADMIN);
    await service.deleteUser(ADMIN_ID, 'u2');

    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      userId: 'u2',
      name: 'a.pdf',
      status: 'FAILED',
      filePath: 'uploads/a.pdf',
      collections: [],
    });
    await service.deleteDocument(ADMIN_ID, 'doc-1');
    await service.reprocessDocument(ADMIN_ID, 'doc-1');

    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
    });
    await service.retryJob(ADMIN_ID, '7');
    await service.removeJob(ADMIN_ID, '7');
    queue.getJobs.mockResolvedValue([]);
    queue.clean.mockResolvedValue([]);
    await service.retryAllFailedJobs(ADMIN_ID);
    await service.cleanCompletedJobs(ADMIN_ID);

    expect(auditActions(prisma)).toEqual([
      'user.role_change',
      'user.delete',
      'document.delete',
      'document.reprocess',
      'job.retry',
      'job.remove',
      'job.retry_failed',
      'job.clean_completed',
    ]);
  });

  it('audit write failure never fails the admin operation', async () => {
    const { service, prisma, queue } = setup();
    prisma.adminAuditLog.create.mockRejectedValue(new Error('db down'));
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('failed'),
      retry: jest.fn().mockResolvedValue(undefined),
    });
    await expect(service.retryJob(ADMIN_ID, '7')).resolves.toEqual({
      success: true,
    });
  });

  it('getAuditLog resolves admin emails and falls back to the id', async () => {
    const { service, prisma } = setup();
    prisma.adminAuditLog.findMany.mockResolvedValue([
      { id: 'a1', adminUserId: 'admin-1', action: 'user.delete' },
      { id: 'a2', adminUserId: 'gone-admin', action: 'job.retry' },
    ]);
    prisma.adminAuditLog.count.mockResolvedValue(2);
    prisma.user.findMany.mockResolvedValue([
      { id: 'admin-1', email: 'root@x.io' },
    ]);

    const result = await service.getAuditLog(1, 20);
    expect(result.total).toBe(2);
    expect(result.entries[0].adminEmail).toBe('root@x.io');
    expect(result.entries[1].adminEmail).toBe('gone-admin');
  });
});
