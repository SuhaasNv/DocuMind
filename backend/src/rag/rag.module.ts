import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client.js';
import { LlmService } from './llm.service.js';
import { PromptService } from './prompt.service.js';
import { ChatCacheService } from './chat-cache.service.js';

@Module({
  providers: [PromptService, GeminiClient, LlmService, ChatCacheService],
  exports: [PromptService, LlmService, ChatCacheService],
})
export class RagModule {}
