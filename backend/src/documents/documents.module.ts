import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { RetrievalService } from './retrieval.service.js';
import { RagOrchestratorService } from './rag-orchestrator.service.js';
import { RagModule } from '../rag/rag.module.js';
import { JobsModule } from '../jobs/jobs.module.js';
import { ChunksModule } from '../chunks/chunks.module.js';

@Module({
  imports: [RagModule, JobsModule, ChunksModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, RetrievalService, RagOrchestratorService],
  exports: [DocumentsService, RetrievalService],
})
export class DocumentsModule {}
