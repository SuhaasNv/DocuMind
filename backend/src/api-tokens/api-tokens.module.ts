import { Module } from '@nestjs/common';
import { ApiTokensController } from './api-tokens.controller.js';
import { ApiTokensService } from './api-tokens.service.js';
import { ApiTokenGuard } from './api-token.guard.js';

@Module({
  controllers: [ApiTokensController],
  providers: [ApiTokensService, ApiTokenGuard],
  exports: [ApiTokensService, ApiTokenGuard],
})
export class ApiTokensModule {}
