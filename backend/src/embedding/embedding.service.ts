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
    // Number(): env values arrive as strings; a raw config.get<number>() would
    // make the dimension check below compare 1536 !== "1536" and always throw.
    this.dimension = Number(
      this.config.get<string | number>(
        'EMBEDDING_DIMENSION',
        EMBEDDING_DIMENSION_DEFAULT,
      ),
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
    return (await this.embedBatch([text]))[0];
  }

  /**
   * Generate embeddings for many texts in one provider call.
   * OpenAI's /v1/embeddings accepts an array input; stub maps locally.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (this.provider === 'openai') {
      return this.embedBatchOpenAI(texts);
    }
    return texts.map((t) => this.embedStub(t));
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
   * One request for the whole batch; results are index-ordered by the API.
   */
  private async embedBatchOpenAI(texts: string[]): Promise<number[][]> {
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
      body: JSON.stringify({
        input: texts.map((t) => t.slice(0, 8191)),
        model,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI embedding failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ index?: number; embedding?: number[] }>;
    };
    const rows = data?.data;
    if (!rows || rows.length !== texts.length) {
      throw new Error(
        `OpenAI returned ${rows?.length ?? 0} embeddings, expected ${texts.length}`,
      );
    }
    const out = new Array<number[]>(texts.length);
    for (const row of rows) {
      const embedding = row.embedding;
      if (
        row.index === undefined ||
        !embedding ||
        embedding.length !== this.dimension
      ) {
        throw new Error(
          `OpenAI returned embedding with dimension ${embedding?.length ?? 0}, expected ${this.dimension}`,
        );
      }
      out[row.index] = embedding;
    }
    return out;
  }
}
