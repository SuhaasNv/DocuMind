import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const EMBEDDING_DIMENSION_DEFAULT = 1536;

/**
 * Embedding service: single configurable provider (stub or real).
 * Ensures consistent dimension for all chunks.
 */
@Injectable()
export class EmbeddingService {
  private readonly dimension: number;
  private readonly provider: string;

  constructor(private readonly config: ConfigService) {
    this.dimension = this.config.get<number>(
      'EMBEDDING_DIMENSION',
      EMBEDDING_DIMENSION_DEFAULT,
    );
    this.provider = this.config.get<string>('EMBEDDING_PROVIDER', 'stub');
  }

  getDimension(): number {
    return this.dimension;
  }

  /**
   * Generate embedding vector for a single text chunk.
   * Stub: returns deterministic pseudo-vector from text hash (same text → same vector).
   * Real: set EMBEDDING_PROVIDER=openai and OPENAI_API_KEY for OpenAI embeddings.
   */
  async embed(text: string): Promise<number[]> {
    if (this.provider === 'openai') {
      return this.embedOpenAI(text);
    }
    return this.embedStub(text);
  }

  /**
   * Stub: deterministic vector from simple hash of text, normalized to unit-ish length.
   * Same content → same vector (useful for tests and when no API key).
   */
  private embedStub(text: string): number[] {
    const vec = new Array<number>(this.dimension);
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      const x = Math.sin(seed + i * 1.1) * 0.5 + 0.5;
      vec[i] = x;
      sumSq += x * x;
    }
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < this.dimension; i++) {
      vec[i] /= norm;
    }
    return vec;
  }

  /**
   * OpenAI text-embedding-3-small (dimension 1536) or configurable model.
   */
  private async embedOpenAI(text: string): Promise<number[]> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai',
      );
    }
    const model = this.config.get<string>(
      'OPENAI_EMBEDDING_MODEL',
      'text-embedding-3-small',
    );
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text.slice(0, 8191), model }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embedding failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data?.data?.[0]?.embedding;
    if (!embedding || embedding.length !== this.dimension) {
      throw new Error(
        `OpenAI returned embedding with dimension ${embedding?.length ?? 0}, expected ${this.dimension}`,
      );
    }
    return embedding;
  }
}
