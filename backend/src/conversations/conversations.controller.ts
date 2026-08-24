import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  CurrentUser,
  type JwtPayload,
} from '../common/decorators/current-user.decorator.js';
import { ConversationsService } from './conversations.service.js';
import {
  ConversationsQueryDto,
  type ConversationDetailDto,
  type ConversationListResponseDto,
} from './dto/conversation.dto.js';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ConversationsQueryDto,
  ): Promise<ConversationListResponseDto> {
    return this.conversationsService.list(user.sub, {
      take: query.take ?? 24,
      skip: query.skip ?? 0,
      documentId: query.documentId,
      collectionId: query.collectionId,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<ConversationDetailDto> {
    return this.conversationsService.findOneWithMessages(id, user.sub);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.conversationsService.remove(id, user.sub);
  }
}
