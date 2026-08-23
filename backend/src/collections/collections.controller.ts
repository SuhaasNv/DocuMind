import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CollectionsService } from './collections.service.js';
import { RagOrchestratorService } from '../documents/rag-orchestrator.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import type { CollectionResponseDto } from './dto/collection-response.dto.js';
import type { ChatResponseDto } from '../documents/dto/chat-response.dto.js';
import {
  CreateCollectionDto,
  UpdateCollectionDto,
  AddCollectionDocumentDto,
} from './dto/collection.dto.js';
import { ChatRequestDto } from '../documents/dto/chat-request.dto.js';

/** Same chat rate limit as the single-document chat endpoints. */
const CHAT_THROTTLE = { default: { limit: 30, ttl: 60000 } }; // 30 per minute

const NO_READY_DOCUMENTS_MESSAGE =
  'This collection has no documents that are ready for chat. Add documents and wait until processing is complete.';

@Controller('collections')
@UseGuards(JwtAuthGuard)
export class CollectionsController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly ragOrchestratorService: RagOrchestratorService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCollectionDto,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.create(user.sub, dto.name);
  }

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
  ): Promise<CollectionResponseDto[]> {
    return this.collectionsService.findAllByUser(user.sub);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.findOne(id, user.sub);
  }

  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body() dto: UpdateCollectionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.rename(id, user.sub, dto.name);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.collectionsService.remove(id, user.sub);
  }

  @Post(':id/documents')
  async addDocument(
    @Param('id') id: string,
    @Body() dto: AddCollectionDocumentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.addDocument(id, user.sub, dto.documentId);
  }

  @Delete(':id/documents/:documentId')
  async removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<CollectionResponseDto> {
    return this.collectionsService.removeDocument(id, user.sub, documentId);
  }

  @Post(':id/chat')
  @Throttle(CHAT_THROTTLE)
  async chat(
    @Param('id') id: string,
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChatResponseDto> {
    const target = await this.collectionsService.getChatTarget(id, user.sub);
    if (target.documents.length === 0) {
      throw new BadRequestException(NO_READY_DOCUMENTS_MESSAGE);
    }
    return this.ragOrchestratorService.chat({
      userId: user.sub,
      collection: target,
      question: dto.question,
      history: dto.history,
      debug: dto.debug,
    });
  }

  /**
   * SSE streaming collection chat: same protocol as
   * POST /documents/:id/chat/stream (event: delta / error / done).
   */
  @Post(':id/chat/stream')
  @Throttle(CHAT_THROTTLE)
  async chatStream(
    @Param('id') id: string,
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const target = await this.collectionsService.getChatTarget(id, user.sub);
    if (target.documents.length === 0) {
      throw new BadRequestException(NO_READY_DOCUMENTS_MESSAGE);
    }

    const ac = new AbortController();
    req.on('close', () => {
      ac.abort();
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      for await (const event of this.ragOrchestratorService.streamAnswer(
        {
          userId: user.sub,
          collection: target,
          question: dto.question,
          history: dto.history,
          debug: dto.debug,
        },
        ac.signal,
      )) {
        if (ac.signal.aborted || res.writableEnded) break;
        if (event.type === 'delta') {
          res.write(`event: delta\ndata: ${JSON.stringify(event.data)}\n\n`);
        } else if (event.type === 'error') {
          res.write(`event: error\ndata: ${JSON.stringify(event.data)}\n\n`);
        } else {
          res.write(`event: done\ndata: ${JSON.stringify(event.data)}\n\n`);
        }
        if (
          typeof (res as Response & { flush?: () => void }).flush === 'function'
        ) {
          (res as Response & { flush: () => void }).flush();
        }
      }
    } catch {
      if (!ac.signal.aborted && !res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: 'Stream error' })}\n\n`,
        );
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
