import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MeService } from '../me/me.service';

const OWNER = 'user-a';
const INTRUDER = 'user-b';

interface PrismaMock {
  conversation: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
}

function makePrisma(): PrismaMock {
  return {
    conversation: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

const baseConversation = {
  id: 'conv-1',
  userId: OWNER,
  documentId: 'doc-1',
  collectionId: null,
  title: 'What is this about?',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ConversationsService ownership guard', () => {
  let prisma: PrismaMock;
  let service: ConversationsService;

  beforeEach(() => {
    prisma = makePrisma();
    const meService = { invalidateStats: jest.fn() } as unknown as MeService;
    service = new ConversationsService(
      prisma as unknown as PrismaService,
      meService,
    );
  });

  it('404s for a missing conversation', async () => {
    prisma.conversation.findUnique.mockResolvedValue(null);
    await expect(
      service.findOneWithMessages('nope', OWNER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("403s another user's conversation on read, delete, and beginTurn", async () => {
    prisma.conversation.findUnique.mockResolvedValue(baseConversation);
    await expect(
      service.findOneWithMessages('conv-1', INTRUDER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('conv-1', INTRUDER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.beginTurn(INTRUDER, { documentId: 'doc-1' }, 'conv-1', 'q'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
    expect(prisma.conversation.update).not.toHaveBeenCalled();
  });

  it('400s a conversationId bound to a different target', async () => {
    prisma.conversation.findUnique.mockResolvedValue(baseConversation);
    await expect(
      service.beginTurn(OWNER, { documentId: 'doc-OTHER' }, 'conv-1', 'q'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a conversation with userId from the JWT and a capped title', async () => {
    prisma.conversation.create.mockResolvedValue({ id: 'conv-new' });
    const longQuestion = 'x'.repeat(500);
    const id = await service.beginTurn(
      OWNER,
      { documentId: 'doc-1' },
      undefined,
      longQuestion,
    );
    expect(id).toBe('conv-new');
    const calls = prisma.conversation.create.mock.calls as Array<
      [{ data: { userId: string; title: string } }]
    >;
    expect(calls[0][0].data.userId).toBe(OWNER);
    expect(calls[0][0].data.title).toHaveLength(80);
  });

  it('appends the user message to an owned, matching conversation', async () => {
    prisma.conversation.findUnique.mockResolvedValue(baseConversation);
    prisma.conversation.update.mockResolvedValue(baseConversation);
    const id = await service.beginTurn(
      OWNER,
      { documentId: 'doc-1' },
      'conv-1',
      'follow-up',
    );
    expect(id).toBe('conv-1');
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conv-1' },
      data: {
        messages: { create: { role: 'user', content: 'follow-up' } },
      },
    });
  });
});
