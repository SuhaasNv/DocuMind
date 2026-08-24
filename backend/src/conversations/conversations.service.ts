import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  Conversation,
  ConversationMessage,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ChatSourceDto } from '../documents/dto/chat-response.dto.js';
import type {
  ConversationDetailDto,
  ConversationListResponseDto,
  ConversationMessageDto,
  ConversationSummaryDto,
} from './dto/conversation.dto.js';

/** Chat target a conversation is bound to (exactly one side set). */
export interface ConversationTarget {
  documentId?: string;
  collectionId?: string;
}

const TITLE_MAX = 80;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Ownership gate shared by every conversation accessor: 404 then 403. */
  private async getOwned(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (conversation.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return conversation;
  }

  async list(
    userId: string,
    options: {
      take: number;
      skip: number;
      documentId?: string;
      collectionId?: string;
    },
  ): Promise<ConversationListResponseDto> {
    const where: Prisma.ConversationWhereInput = {
      userId,
      ...(options.documentId ? { documentId: options.documentId } : {}),
      ...(options.collectionId ? { collectionId: options.collectionId } : {}),
    };
    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: options.take,
        skip: options.skip,
        include: {
          document: { select: { name: true } },
          messages: {
            where: { role: 'user' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true },
          },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      items: conversations.map((c) => ({
        ...this.toSummary(c, c.document?.name),
        lastUserMessage: c.messages[0]?.content,
      })),
      total,
    };
  }

  async findOneWithMessages(
    id: string,
    userId: string,
  ): Promise<ConversationDetailDto> {
    await this.getOwned(id, userId);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id },
      include: {
        document: { select: { name: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    return {
      ...this.toSummary(conversation, conversation.document?.name),
      messages: conversation.messages.map((m) => this.toMessage(m)),
    };
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.getOwned(id, userId);
    // Messages cascade via the FK.
    await this.prisma.conversation.delete({ where: { id } });
  }

  /**
   * Start (or continue) a persisted chat turn. Validates a client-sent
   * conversationId (must exist, be owned, and match the target) or creates a
   * new conversation titled with the first question. Persists the user
   * message immediately. userId comes from the JWT only — never the body.
   * Returns the conversation id.
   */
  async beginTurn(
    userId: string,
    target: ConversationTarget,
    conversationId: string | undefined,
    question: string,
  ): Promise<string> {
    if (conversationId) {
      const conversation = await this.getOwned(conversationId, userId);
      const matchesTarget =
        (target.documentId ?? null) === conversation.documentId &&
        (target.collectionId ?? null) === conversation.collectionId;
      if (!matchesTarget) {
        throw new BadRequestException(
          'conversationId does not belong to this chat target',
        );
      }
      await this.appendMessage(conversationId, {
        role: 'user',
        content: question,
      });
      return conversationId;
    }

    const title = question.trim().slice(0, TITLE_MAX) || 'New conversation';
    const created = await this.prisma.conversation.create({
      data: {
        userId,
        documentId: target.documentId ?? null,
        collectionId: target.collectionId ?? null,
        title,
        messages: { create: { role: 'user', content: question } },
      },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Persist the assistant message once the answer is complete (or aborted:
   * partial content with truncated=true). No-op for empty content. Never
   * throws — chat delivery must not fail on persistence problems.
   */
  async completeTurn(
    conversationId: string,
    content: string,
    sources: ChatSourceDto[],
    truncated: boolean,
  ): Promise<void> {
    if (!content) return;
    try {
      await this.appendMessage(conversationId, {
        role: 'assistant',
        content,
        sources: sources.length
          ? (sources as unknown as Prisma.InputJsonValue)
          : undefined,
        truncated,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist assistant message for conversation ${conversationId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Append one message; updating through the parent bumps its updatedAt. */
  private async appendMessage(
    conversationId: string,
    message: {
      role: 'user' | 'assistant';
      content: string;
      sources?: Prisma.InputJsonValue;
      truncated?: boolean;
    },
  ): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { messages: { create: message } },
    });
  }

  private toSummary(
    conversation: Conversation,
    documentName?: string,
  ): ConversationSummaryDto {
    return {
      id: conversation.id,
      title: conversation.title,
      documentId: conversation.documentId,
      collectionId: conversation.collectionId,
      documentName,
      // Phase 9 integration point: collectionName once collections land.
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessage(message: ConversationMessage): ConversationMessageDto {
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const sources = Array.isArray(message.sources)
      ? (message.sources as unknown as ChatSourceDto[])
      : undefined;
    return {
      id: message.id,
      role,
      content: message.content,
      sources,
      truncated: message.truncated,
      createdAt: message.createdAt,
    };
  }
}
