import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  Res,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { DocumentStatus } from '../../generated/prisma/enums.js';
import { DocumentsService } from './documents.service.js';
import { RetrievalService } from './retrieval.service.js';
import { RagOrchestratorService } from './rag-orchestrator.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import type { DocumentResponseDto } from './dto/document-response.dto.js';
import type { RetrievalResponseDto } from './dto/retrieval-response.dto.js';
import type { ChatResponseDto } from './dto/chat-response.dto.js';
import { RetrievalQueryDto } from './dto/retrieval-query.dto.js';
import { ChatRequestDto } from './dto/chat-request.dto.js';

const PDF_MIME = 'application/pdf';
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

/** Limit uploads to prevent storage/CPU abuse. */
const UPLOAD_THROTTLE = { default: { limit: 15, ttl: 60000 } }; // 15 per minute
/** Limit chat requests to prevent LLM/API abuse. */
const CHAT_THROTTLE = { default: { limit: 30, ttl: 60000 } }; // 30 per minute

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly retrievalService: RetrievalService,
    private readonly ragOrchestratorService: RagOrchestratorService,
  ) {}

  @Post('upload')
  @Throttle(UPLOAD_THROTTLE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
    }),
  )
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_SIZE }),
          new FileTypeValidator({ fileType: PDF_MIME }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.createFromUpload(user.sub, file);
  }

  @Get()
  async findAll(
    @CurrentUser() user: JwtPayload,
  ): Promise<DocumentResponseDto[]> {
    return this.documentsService.findAllByUser(user.sub);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.findOne(id, user.sub);
  }

  @Get(':id/retrieval')
  async retrieval(
    @Param('id') id: string,
    @Query() query: RetrievalQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<RetrievalResponseDto> {
    const results = await this.retrievalService.retrieve({
      userId: user.sub,
      documentId: id,
      query: query.query,
      topK: query.topK,
    });
    return { results };
  }

  /**
   * Serve the original PDF for the citation viewer. Ownership-checked;
   * supports HTTP Range requests (pdf.js issues them). 404 when the file is
   * gone (ephemeral-disk redeploy) without leaking filesystem paths.
   */
  @Get(':id/file')
  async getFile(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { absolutePath } = await this.documentsService.getFileForDownload(
      id,
      user.sub,
    );
    const { size } = await stat(absolutePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');

    const range = req.headers.range;
    if (range) {
      // Only "bytes=start-end" over the known file — no client-supplied paths.
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = m && m[1] !== '' ? parseInt(m[1], 10) : 0;
      const end =
        m && m[2] !== '' ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
      if (!m || start > end || start >= size) {
        res.status(416).setHeader('Content-Range', `bytes */${size}`);
        res.end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      createReadStream(absolutePath, { start, end }).pipe(res);
      return;
    }
    res.setHeader('Content-Length', size);
    createReadStream(absolutePath).pipe(res);
  }

  @Post(':id/chat')
  @Throttle(CHAT_THROTTLE)
  async chat(
    @Param('id') id: string,
    @Body() dto: ChatRequestDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<ChatResponseDto> {
    const document = await this.documentsService.findOne(id, user.sub);
    if (document.status !== DocumentStatus.DONE) {
      throw new BadRequestException(
        `Document is not ready for chat. Current status: ${document.status}. Wait until processing is complete.`,
      );
    }
    return this.ragOrchestratorService.chat({
      userId: user.sub,
      documentId: id,
      question: dto.question,
      history: dto.history,
    });
  }

  /**
   * SSE streaming chat: same auth and validation as POST /documents/:id/chat.
   * Streams tokens as event: delta, then event: done with sources.
   * Aborts Ollama request cleanly on client disconnect; does not throw.
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
    const document = await this.documentsService.findOne(id, user.sub);
    if (document.status !== DocumentStatus.DONE) {
      throw new BadRequestException(
        `Document is not ready for chat. Current status: ${document.status}. Wait until processing is complete.`,
      );
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
          documentId: id,
          question: dto.question,
          history: dto.history,
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

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.documentsService.remove(id, user.sub);
  }

  @Post(':id/retry')
  async retry(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.retry(id, user.sub);
  }
}
