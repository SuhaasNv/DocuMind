import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller.js';
import { CollectionsService } from './collections.service.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { RagModule } from '../rag/rag.module.js';

@Module({
  imports: [DocumentsModule, RagModule],
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
