import { Module } from '@nestjs/common';
import { PromptService } from './prompt.service.js';
import { LlmService } from './llm.service.js';

@Module({
  providers: [PromptService, LlmService],
  exports: [PromptService, LlmService],
})
export class RagModule {}
