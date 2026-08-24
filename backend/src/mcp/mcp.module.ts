import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller.js';
import { McpToolsService } from './mcp-tools.service.js';
import { ApiTokensModule } from '../api-tokens/api-tokens.module.js';
import { DocumentsModule } from '../documents/documents.module.js';

@Module({
  imports: [ApiTokensModule, DocumentsModule],
  controllers: [McpController],
  providers: [McpToolsService],
})
export class McpModule {}
