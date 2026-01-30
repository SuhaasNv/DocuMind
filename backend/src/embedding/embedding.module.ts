import { Global, Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service.js';

@Global()
@Module({
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
