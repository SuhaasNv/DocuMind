import { IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto.js';
import type { ChatSourceDto } from '../../documents/dto/chat-response.dto.js';

/** GET /conversations query: pagination plus an optional target filter. */
export class ConversationsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  collectionId?: string;
}

export interface ConversationSummaryDto {
  id: string;
  title: string;
  documentId: string | null;
  collectionId: string | null;
  /** Joined document name (undefined when the document was deleted). */
  documentName?: string;
  /** Phase 9 integration point: joined collection name once collections land. */
  collectionName?: string;
  /** Most recent user question in this conversation. */
  lastUserMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationListResponseDto {
  items: ConversationSummaryDto[];
  total: number;
}

export interface ConversationMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSourceDto[];
  truncated: boolean;
  createdAt: Date;
}

export interface ConversationDetailDto extends Omit<
  ConversationSummaryDto,
  'lastUserMessage'
> {
  messages: ConversationMessageDto[];
}
