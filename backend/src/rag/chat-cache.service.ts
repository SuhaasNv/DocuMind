import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { getRedisConnection } from '../lib/redis-connection.js';
import type { ChatSourceDto } from '../documents/dto/chat-response.dto.js';

export interface CachedChat {
  /** Display answer (trailing FOLLOWUPS line already stripped). */
  answer: string;
  sources: ChatSourceDto[];
  /** Follow-up questions, stored separately so cache replays include chips. */
  followUps?: string[];
}

interface CacheEntry extends CachedChat {
  question: string;
  embedding?: number[];
}

/** Cap on entries scanned per document for the semantic pass. */
const MAX_SEMANTIC_ENTRIES = 100;

/** Cosine similarity between two raw vectors; -1 on length mismatch. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? -1 : dot / denom;
}

/** Case/whitespace-insensitive form used for exact-match keys. */
export function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Two-layer chat cache on Redis.
 *
 * L1 exact: hash(normalized question) + scope + settings key.
 * L2 semantic: cosine-compare the query embedding against the scope's
 * cached entries; serve when similarity ≥ CHAT_CACHE_SEMANTIC_THRESHOLD.
 * Query embeddings themselves are cached under their own exact key.
 *
 * `scope` is the chat target: a documentId for single-document chat, or a
 * collection scope key (collectionId + membership hash) for collection chat.
 * Keys are scoped per target AND per answer-affecting settings (topK),
 * indexed in a per-scope set so invalidation needs no SCAN.
 */
@Injectable()
export class ChatCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatCacheService.name);
  private readonly client: Redis;
  private readonly ttlSeconds: number;
  private readonly threshold: number;

  constructor(config: ConfigService) {
    this.ttlSeconds = Number(
      config.get<string | number>('CHAT_CACHE_TTL_SECONDS', 3600),
    );
    this.threshold = Number(
      config.get<string | number>('CHAT_CACHE_SEMANTIC_THRESHOLD', 0.95),
    );
    this.client = new Redis({
      ...getRedisConnection(),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    // Cache is best-effort: never let Redis trouble break chat.
    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis cache error: ${err.message}`);
    });
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 32);
  }

  private entryKey(
    scope: string,
    settingsKey: string,
    question: string,
  ): string {
    return `cc2:${scope}:${settingsKey}:${this.hash(normalizeQuestion(question))}`;
  }

  private indexKey(scope: string): string {
    return `cc2:index:${scope}`;
  }

  private qembKey(question: string): string {
    return `cc:qemb:${this.hash(normalizeQuestion(question))}`;
  }

  async getExact(
    scope: string,
    settingsKey: string,
    question: string,
  ): Promise<CachedChat | null> {
    try {
      const raw = await this.client.get(
        this.entryKey(scope, settingsKey, question),
      );
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      return {
        answer: entry.answer,
        sources: entry.sources,
        followUps: entry.followUps,
      };
    } catch {
      return null;
    }
  }

  async getSemantic(
    scope: string,
    settingsKey: string,
    queryEmbedding: number[],
  ): Promise<{ hit: CachedChat; similarity: number } | null> {
    try {
      const keys = (await this.client.smembers(this.indexKey(scope))).filter(
        (k) => k.startsWith(`cc2:${scope}:${settingsKey}:`),
      );
      if (keys.length === 0) return null;
      const values = await this.client.mget(
        keys.slice(0, MAX_SEMANTIC_ENTRIES),
      );
      let best: { entry: CacheEntry; similarity: number } | null = null;
      for (const raw of values) {
        if (!raw) continue;
        const entry = JSON.parse(raw) as CacheEntry;
        if (!entry.embedding) continue;
        const sim = cosineSimilarity(queryEmbedding, entry.embedding);
        if (sim >= this.threshold && (!best || sim > best.similarity)) {
          best = { entry, similarity: sim };
        }
      }
      if (!best) return null;
      return {
        hit: {
          answer: best.entry.answer,
          sources: best.entry.sources,
          followUps: best.entry.followUps,
        },
        similarity: best.similarity,
      };
    } catch {
      return null;
    }
  }

  async store(
    scope: string,
    settingsKey: string,
    question: string,
    embedding: number[] | null,
    answer: string,
    sources: ChatSourceDto[],
    followUps: string[] = [],
  ): Promise<void> {
    try {
      const key = this.entryKey(scope, settingsKey, question);
      const entry: CacheEntry = {
        question: normalizeQuestion(question),
        answer,
        sources,
        ...(followUps.length > 0 ? { followUps } : {}),
        ...(embedding ? { embedding } : {}),
      };
      await this.client
        .multi()
        .set(key, JSON.stringify(entry), 'EX', this.ttlSeconds)
        .sadd(this.indexKey(scope), key)
        .expire(this.indexKey(scope), this.ttlSeconds)
        .exec();
    } catch {
      /* best-effort */
    }
  }

  async getQueryEmbedding(question: string): Promise<number[] | null> {
    try {
      const raw = await this.client.get(this.qembKey(question));
      return raw ? (JSON.parse(raw) as number[]) : null;
    } catch {
      return null;
    }
  }

  async storeQueryEmbedding(
    question: string,
    embedding: number[],
  ): Promise<void> {
    try {
      await this.client.set(
        this.qembKey(question),
        JSON.stringify(embedding),
        'EX',
        this.ttlSeconds,
      );
    } catch {
      /* best-effort */
    }
  }

  /** Drop every cached answer for a scope (reprocess, delete, membership change). */
  async invalidateScope(scope: string): Promise<void> {
    try {
      const index = this.indexKey(scope);
      const keys = await this.client.smembers(index);
      if (keys.length > 0) await this.client.del(...keys);
      await this.client.del(index);
      this.logger.log(
        `[chat-cache] invalidated ${keys.length} entries for scope ${scope}`,
      );
    } catch {
      /* best-effort */
    }
  }
}
