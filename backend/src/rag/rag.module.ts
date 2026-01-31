import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini.client.js';
import { LlmService } from './llm.service.js';
import { PromptService } from './prompt.service.js';

@Module({
  providers: [PromptService, GeminiClient, LlmService],
  exports: [PromptService, LlmService],
})
export class RagModule {}
