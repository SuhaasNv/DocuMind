import { DocumentsService } from './documents.service';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DocumentChunkService } from '../chunks/document-chunk.service.js';
import type { Queue } from 'bullmq';
import type { ChatCacheService } from '../rag/chat-cache.service.js';
import type { DocumentSummaryService } from '../rag/document-summary.service.js';
import type { MeService } from '../me/me.service.js';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn(),
}));

import { writeFile, unlink } from 'node:fs/promises';

const writeFileMock = writeFile as jest.Mock;
const unlinkMock = unlink as jest.Mock;

/**
 * Regression: if the file write or job enqueue fails AFTER the Document row
 * is created, the row must be removed again — otherwise the dashboard shows
 * a "Pending" card that never progresses (no job was ever queued).
 */
describe('DocumentsService.createFromUpload compensation', () => {
  const row = { id: 'doc-1', userId: 'u1', name: 'a.pdf' };

  function makeService(queueAdd: jest.Mock) {
    const create = jest.fn().mockResolvedValue(row);
    const update = jest.fn().mockResolvedValue({ ...row, filePath: 'x' });
    const del = jest.fn().mockResolvedValue(row);
    const prisma = {
      document: { create, update, delete: del },
    } as unknown as PrismaService;
    const service = new DocumentsService(
      prisma,
      {} as unknown as DocumentChunkService,
      { add: queueAdd } as unknown as Queue,
      {} as unknown as ChatCacheService,
      {} as unknown as DocumentSummaryService,
      { invalidateStats: jest.fn() } as unknown as MeService,
    );
    return { service, del };
  }

  const file = {
    buffer: Buffer.from('%PDF-1.4'),
    mimetype: 'application/pdf',
    size: 8,
    originalname: 'a.pdf',
  } as Express.Multer.File;

  beforeEach(() => {
    writeFileMock.mockReset().mockResolvedValue(undefined);
    unlinkMock.mockClear();
  });

  it('deletes the orphan row when the file write fails', async () => {
    writeFileMock.mockRejectedValue(new Error('disk full'));
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const { service, del } = makeService(queueAdd);

    await expect(service.createFromUpload('u1', file)).rejects.toThrow(
      'disk full',
    );
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('deletes the row and the written file when enqueueing fails', async () => {
    const queueAdd = jest.fn().mockRejectedValue(new Error('queue down'));
    const { service, del } = makeService(queueAdd);

    await expect(service.createFromUpload('u1', file)).rejects.toThrow(
      'queue down',
    );
    expect(del).toHaveBeenCalledWith({ where: { id: 'doc-1' } });
    expect(unlinkMock).toHaveBeenCalled();
  });

  it('succeeds normally: no compensation on the happy path', async () => {
    const queueAdd = jest.fn().mockResolvedValue(undefined);
    const { service, del } = makeService(queueAdd);

    await expect(service.createFromUpload('u1', file)).resolves.toBeDefined();
    expect(del).not.toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledTimes(1);
  });
});
