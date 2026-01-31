import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeminiClient } from './gemini.client.js';

export const LLM_PROVIDER_DEFAULT = 'stub';

/**
 * Configurable LLM service: stub, ollama, openai, or gemini.
 * - complete(prompt): full response (no streaming).
 * - stream(prompt, signal): async generator of text tokens; supports abort via signal.
 * Ollama and Gemini support streaming; OpenAI streaming not implemented (throws NotImplementedException).
 */
@Injectable()
export class LlmService {
  private readonly provider: string;
  private readonly ollamaBaseUrl: string;
  private readonly ollamaModel: string;
  private readonly openaiModel: string;

  constructor(
    private readonly config: ConfigService,
    private readonly geminiClient: GeminiClient,
  ) {
    this.provider = this.config.get<string>(
      'LLM_PROVIDER',
      LLM_PROVIDER_DEFAULT,
    );
    this.ollamaBaseUrl = this.config.get<string>(
      'OLLAMA_BASE_URL',
      'http://localhost:11434',
    );
    this.ollamaModel = this.config.get<string>('OLLAMA_MODEL', 'llama3.2');
    this.openaiModel = this.config.get<string>(
      'OPENAI_CHAT_MODEL',
      'gpt-4o-mini',
    );
  }

  /**
   * Stream tokens from the configured LLM. Yields text chunks only.
   * Pass AbortSignal to cancel (e.g. on client disconnect).
   * - Ollama: streaming via /api/generate with stream: true.
   * - Stub: yields a placeholder message incrementally.
   * - OpenAI: throws NotImplementedException (extensible for future Gemini/OpenAI streaming).
   */
  async *stream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    switch (this.provider) {
      case 'ollama':
        yield* this.streamOllama(prompt, signal);
        return;
      case 'gemini':
        yield* this.geminiClient.stream(prompt, signal);
        return;
      case 'openai':
        throw new NotImplementedException(
          'OpenAI streaming is not implemented. Use LLM_PROVIDER=ollama for streaming, or POST /documents/:id/chat for non-streaming.',
        );
      default:
        yield* this.streamStub(prompt);
    }
  }

  /**
   * Send prompt to the configured LLM and return the full completion (no streaming).
   */
  async complete(prompt: string): Promise<string> {
    switch (this.provider) {
      case 'ollama':
        return this.completeOllama(prompt);
      case 'gemini':
        return this.completeGemini(prompt);
      case 'openai':
        return this.completeOpenAI(prompt);
      default:
        return this.completeStub(prompt);
    }
  }

  /**
   * Stub: returns a deterministic placeholder. Useful for tests and when no API key is set.
   */
  private completeStub(_prompt: string): Promise<string> {
    return Promise.resolve(
      'This is a stub response. Set LLM_PROVIDER=ollama or LLM_PROVIDER=openai and configure the corresponding environment variables.',
    );
  }

  /**
   * Ollama: local models via /api/generate (no streaming; we request and wait for full response).
   */
  private async completeOllama(prompt: string): Promise<string> {
    const url = `${this.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: false,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama request failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as { response?: string };
    const response = data?.response;
    if (typeof response !== 'string') {
      throw new Error('Ollama returned invalid response');
    }
    return response.trim();
  }

  /**
   * Gemini: generateContent (no streaming).
   */
  private async completeGemini(prompt: string): Promise<string> {
    return this.geminiClient.complete(prompt);
  }

  /**
   * OpenAI: chat completions (no streaming).
   */
  private async completeOpenAI(prompt: string): Promise<string> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.openaiModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI request failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenAI returned invalid response');
    }
    return content.trim();
  }

  /**
   * Stub streaming: yields a placeholder message token by token (word by word).
   */
  private async *streamStub(
    _prompt: string,
  ): AsyncGenerator<string, void, undefined> {
    const message =
      'This is a stub stream. Set LLM_PROVIDER=ollama and configure OLLAMA_BASE_URL and OLLAMA_MODEL for real streaming.';
    for (const word of message.split(/\s+/)) {
      yield word + ' ';
    }
  }

  /**
   * Ollama streaming: POST /api/generate with stream: true.
   * Parses NDJSON and yields only the "response" field for each line.
   * Aborts the fetch when signal is triggered (e.g. client disconnect).
   */
  private async *streamOllama(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    const url = `${this.ollamaBaseUrl.replace(/\/$/, '')}/api/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        prompt,
        stream: true,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama request failed: ${res.status} ${err}`);
    }

    const body = res.body;
    if (!body) {
      throw new Error('Ollama returned no body');
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const data = JSON.parse(trimmed) as {
            response?: string;
            done?: boolean;
          };
          if (data.response && typeof data.response === 'string') {
            yield data.response;
          }
          if (data.done) return;
        }
      }
      if (buffer.trim()) {
        const data = JSON.parse(buffer.trim()) as { response?: string };
        if (data.response && typeof data.response === 'string') {
          yield data.response;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
