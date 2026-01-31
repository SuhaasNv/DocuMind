import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for Google Gemini API streaming. Used only when LLM_PROVIDER=gemini.
 * Encapsulates SDK usage; no HTTP, SSE, or document logic.
 */
@Injectable()
export class GeminiClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly ai: GoogleGenAI | null = null;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    // gemini-1.5-flash is deprecated; use 2.5-flash or 2.0-flash (see https://ai.google.dev/gemini-api/docs/models).
    this.model = this.config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
    if (this.apiKey) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
  }

  /**
   * Stream text tokens from Gemini. Yields plain text deltas only.
   * If signal.aborted, stops yielding immediately (does not throw).
   * Errors throw once for the orchestrator to handle.
   */
  async *stream(
    prompt: string,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, undefined> {
    if (!this.ai) {
      throw new Error(
        'GEMINI_API_KEY is required when LLM_PROVIDER=gemini. Set GEMINI_API_KEY in your environment.',
      );
    }

    if (typeof this.ai.models.generateContentStream !== 'function') {
      throw new Error(
        'Gemini streaming is not supported in the current SDK version. Ensure @google/genai is installed and supports generateContentStream.',
      );
    }

    let stream: Awaited<
      ReturnType<typeof this.ai.models.generateContentStream>
    >;
    try {
      stream = await this.ai.models.generateContentStream({
        model: this.model,
        contents: prompt,
        config: {
          abortSignal: signal,
        },
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown error calling Gemini';
      yield `Error calling Gemini: ${msg}. Check GEMINI_API_KEY and quota.`;
      throw err;
    }

    let yieldedAny = false;
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) break;
        const text =
          chunk.text ??
          (() => {
            const parts = chunk.candidates?.[0]?.content?.parts;
            if (!parts?.length) return undefined;
            return parts
              .map((p: { text?: string }) => p.text)
              .filter((t): t is string => typeof t === 'string')
              .join('');
          })();
        if (typeof text === 'string' && text.length > 0) {
          yield text;
          yieldedAny = true;
        }
      }
    } catch (err) {
      if (!yieldedAny) {
        const msg =
          err instanceof Error ? err.message : 'Unknown error from Gemini';
        yield `Error from Gemini: ${msg}. Check API key and quota.`;
      }
      throw err;
    }
    if (!yieldedAny) {
      yield "The model did not return any text. It may have been blocked or the response may be empty.";
    }
  }

  /**
   * Non-streaming completion. Used when LLM_PROVIDER=gemini and complete() is called.
   */
  async complete(prompt: string): Promise<string> {
    if (!this.ai) {
      throw new Error(
        'GEMINI_API_KEY is required when LLM_PROVIDER=gemini. Set GEMINI_API_KEY in your environment.',
      );
    }
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
    });
    const text = response.text;
    if (typeof text !== 'string') {
      throw new Error('Gemini returned no text');
    }
    return text.trim();
  }
}
