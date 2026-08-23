/**
 * Shared Redis connection options, parsed from env.
 * Used by the BullMQ queue (jobs.module) and the chat cache.
 *
 * Priority: REDIS_URL (redis:// or rediss://, path selects the logical DB,
 * e.g. redis://host:6379/1) → REDIS_HOST/PORT/PASSWORD → Upstash vars.
 */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: object;
}

export function getRedisConnection(): RedisConnectionOptions {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (
    redisUrl &&
    (redisUrl.startsWith('redis://') || redisUrl.startsWith('rediss://'))
  ) {
    try {
      const u = new URL(redisUrl);
      const host = u.hostname;
      const port = parseInt(u.port || '6379', 10);
      const password = u.password ? decodeURIComponent(u.password) : undefined;
      const needsTls = u.protocol === 'rediss:';
      // Redis URL path selects the logical DB (e.g. redis://host:6379/1).
      const db = parseInt(u.pathname.slice(1), 10);
      return {
        host,
        port,
        password,
        ...(Number.isInteger(db) && { db }),
        ...(needsTls && { tls: {} }),
      };
    } catch {
      /* fall through to env vars */
    }
  }

  let host =
    process.env.REDIS_HOST || process.env.UPSTASH_REDIS_ENDPOINT || 'localhost';
  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  if (restUrl) {
    try {
      const u = new URL(restUrl);
      host = u.hostname;
    } catch {
      /* keep host */
    }
  }
  host = host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const port = parseInt(
    process.env.REDIS_PORT || process.env.UPSTASH_REDIS_PORT || '6379',
    10,
  );
  const password =
    process.env.REDIS_PASSWORD ||
    process.env.UPSTASH_REDIS_PASSWORD ||
    undefined;
  const needsTls =
    host.endsWith('.upstash.io') ||
    process.env.REDIS_TLS === '1' ||
    process.env.REDIS_TLS === 'true';
  return {
    host,
    port,
    password,
    ...(needsTls && { tls: {} }),
  };
}
