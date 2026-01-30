import { Module } from '@nestjs/common';
import { DocumentChunkService } from './document-chunk.service.js';

@Module({
  providers: [DocumentChunkService],
  exports: [DocumentChunkService],
})
export class ChunksModule {}
