import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentProcessor } from './document.processor.js';
import { ChunksModule } from '../chunks/chunks.module.js';
import { RagModule } from '../rag/rag.module.js';
import { getRedisConnection } from '../lib/redis-connection.js';

const QUEUE_NAME = 'document-processing';

@Module({
  imports: [
    BullModule.forRoot({
      connection: getRedisConnection(),
    }),
    BullModule.registerQueue({
      name: QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }),
    ChunksModule,
    RagModule,
  ],
  providers: [DocumentProcessor],
  exports: [BullModule],
})
export class JobsModule {}
