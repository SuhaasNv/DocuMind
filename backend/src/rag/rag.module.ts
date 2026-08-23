import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client.js';
import { LlmService } from './llm.service.js';
import { PromptService } from './prompt.service.js';
import { ChatCacheService } from './chat-cache.service.js';
import { DocumentSummaryService } from './document-summary.service.js';

@Module({
  providers: [
    PromptService,
    GeminiClient,
    LlmService,
    ChatCacheService,
    DocumentSummaryService,
  ],
  exports: [
    PromptService,
    LlmService,
    ChatCacheService,
    DocumentSummaryService,
  ],
})
export class RagModule {}
