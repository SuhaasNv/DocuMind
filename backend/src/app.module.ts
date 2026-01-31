import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { EmbeddingModule } from './embedding/embedding.module.js';
import { ChunksModule } from './chunks/chunks.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = parseInt(config.get('THROTTLE_TTL_MS') ?? '60000', 10) || 60000;
        const limit = parseInt(config.get('THROTTLE_LIMIT') ?? '100', 10) || 100;
        return [{ name: 'default', ttl, limit }];
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    EmbeddingModule,
    ChunksModule,
    JobsModule,
    DocumentsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
