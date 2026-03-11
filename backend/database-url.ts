const DATABASE_URL_KEYS = [
  'DATABASE_URL',
  'DATABASE_PRIVATE_URL',
  'DATABASE_PUBLIC_URL',
  'POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
] as const;

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

export function getDatabaseUrlFromEnv(env: EnvMap = process.env): string | null {
  for (const key of DATABASE_URL_KEYS) {
    const value = env[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function getDatabaseUrlOrThrow(context: string): string {
  const url = getDatabaseUrlFromEnv();
  if (url) return url;

  throw new Error(
    `[${context}] Missing database URL. Set one of: ${DATABASE_URL_KEYS.join(', ')}`,
  );
}
