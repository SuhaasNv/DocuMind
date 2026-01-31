import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentProcessor } from './document.processor.js';
import { ChunksModule } from '../chunks/chunks.module.js';

const QUEUE_NAME = 'document-processing';

function getRedisConnection(): {
  host: string;
  port: number;
  password?: string;
  tls?: object;
} {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl && (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      const port = parseInt(u.port || '6379', 10);
      const password = u.password ? decodeURIComponent(u.password) : undefined;
      const needsTls = u.protocol === 'rediss:';
      return {
        host,
        port,
        password,
        ...(needsTls && { tls: {} }),
      };
    } catch {
      /* fall through to env vars */
    }
  }

  let host =
    process.env.REDIS_HOST ||
    process.env.UPSTASH_REDIS_ENDPOINT ||
    'localhost';
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (restUrl) {
    try {
      const u = new URL(restUrl);
      host = u.hostname;
    } catch {
      /* keep host */
    }
  }
  host = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const port = parseInt(
    process.env.REDIS_PORT || process.env.UPSTASH_REDIS_PORT || '6379',
    10,
  );
  const password =
    process.env.REDIS_PASSWORD ||
    process.env.UPSTASH_REDIS_PASSWORD ||
    undefined;
  const needsTls =
    host.endsWith('.upstash.io') || process.env.REDIS_TLS === '1' || process.env.REDIS_TLS === 'true';
  return {
    host,
    port,
    password,
    ...(needsTls && { tls: {} }),
  };
}

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
  ],
  providers: [DocumentProcessor],
  exports: [BullModule],
})
export class JobsModule {}
