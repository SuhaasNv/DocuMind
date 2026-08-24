import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { RagModule } from '../rag/rag.module.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

@Module({
  imports: [DocumentsModule, RagModule, ConversationsModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
